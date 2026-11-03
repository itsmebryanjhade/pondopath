alter table public.intake_items add column source_evidence jsonb
  check (source_evidence is null or (jsonb_typeof(source_evidence)='object' and octet_length(source_evidence::text)<=16384));
alter table public.intake_items drop constraint intake_items_status_check;
alter table public.intake_items add constraint intake_items_status_check
  check (status in ('pending','needs_match','superseded','rejected','applied','unchanged'));
create index intake_items_source_binding_idx on public.intake_items(source_id,external_id,observed_at desc,id)
  where status='applied';

-- Both staging and reviewed edits use the same strict matcher. Cash commands are never accepted here.
create function private.intake_proposal(p_business_id uuid,p_candidate jsonb,p_reviewed boolean default false)
returns jsonb language plpgsql stable set search_path='' as $$
declare t text; p jsonb; rid uuid; current_row jsonb; ver integer; state text:='pending';
begin
  perform private.assert_command_keys(p_candidate,array['type','payload']);
  t:=private.command_text(p_candidate,'type',64); p:=p_candidate->'payload';
  if t='save_invoice' then
    perform private.assert_command_keys(p,array['number','customerId','amountCents','dueDate'],
      case when p_reviewed then array['id','reason'] else array['id'] end);
    p:=p||jsonb_build_object('number',private.command_text(p,'number',100));
    perform 1 from public.customers where id=private.command_uuid(p,'customerId') and business_id=p_business_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    rid:=private.command_uuid(p,'id',true);
    if rid is null then select id into rid from public.invoices where business_id=p_business_id and number=p->>'number'; end if;
    if rid is not null then
      select to_jsonb(i),version into current_row,ver from public.invoices i where id=rid and business_id=p_business_id;
      if not found then raise exception 'NOT_FOUND'; end if;
    end if;
  elsif t='save_expense' then
    perform private.assert_command_keys(p,array['label','payee','amountCents','dueDate'],
      case when p_reviewed then array['id','reason'] else array['id'] end);
    p:=p||jsonb_build_object('label',private.command_text(p,'label',200),'payee',private.command_text(p,'payee',200));
    rid:=private.command_uuid(p,'id',true);
    if rid is not null then
      select to_jsonb(e),version into current_row,ver from public.expenses e where id=rid and business_id=p_business_id;
      if not found then raise exception 'NOT_FOUND'; end if;
    end if;
  else raise exception 'VALIDATION_ERROR'; end if;
  perform private.command_integer(p,'amountCents',1,99999999999);
  perform private.command_date(p,'dueDate');
  if p ? 'reason' then perform private.command_text(p,'reason',4000); end if;
  if rid is not null then p:=p||jsonb_build_object('id',rid); end if;
  if t='save_expense' and rid is null and exists(select 1 from public.expenses e where business_id=p_business_id
    and label=p->>'label' and payee=p->>'payee' and amount_cents=(p->>'amountCents')::bigint and due_date=(p->>'dueDate')::date) then state:='needs_match'; end if;
  if current_row is not null and (current_row->>'amount_cents')::bigint=(p->>'amountCents')::bigint
    and current_row->>'due_date'=p->>'dueDate' and (
      (t='save_invoice' and current_row->>'number'=p->>'number' and current_row->>'customer_id'=p->>'customerId') or
      (t='save_expense' and current_row->>'label'=p->>'label' and current_row->>'payee'=p->>'payee')) then state:='unchanged'; end if;
  return jsonb_build_object('candidate',jsonb_build_object('type',t,'payload',p),'current',current_row,'recordId',rid,'recordVersion',ver,'status',state);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'VALIDATION_ERROR';
end $$;
revoke all on function private.intake_proposal(uuid,jsonb,boolean) from public,anon,authenticated;

create or replace function public.stage_intake(p_source_id uuid,p_external_id text,p_source_version text,p_candidate jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); source public.intake_sources; old_item public.intake_items;
  binding public.intake_items; candidate jsonb:=p_candidate; proposal jsonb; item_id uuid;
begin
  perform 1 from public.businesses where id=member.business_id for update;
  select * into member from public.memberships where business_id=member.business_id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_external_id is null or length(btrim(p_external_id)) not between 1 and 200 or
    p_source_version is null or length(btrim(p_source_version)) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  select * into source from public.intake_sources where id=p_source_id and business_id=member.business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into old_item from public.intake_items where source_id=source.id and external_id=btrim(p_external_id) and source_version=btrim(p_source_version);
  if found then
    if old_item.original_content is distinct from p_candidate then raise exception 'STALE_VERSION'; end if;
    return old_item.id;
  end if;
  select * into binding from public.intake_items where source_id=source.id and external_id=btrim(p_external_id) and status='applied'
    order by observed_at desc,id desc limit 1;
  if found then
    if binding.candidate->>'type' is distinct from p_candidate->>'type' or
      (p_candidate->'payload' ? 'id' and p_candidate->'payload'->>'id' is distinct from binding.outcome->>'recordId') then raise exception 'STALE_VERSION'; end if;
    candidate:=jsonb_set(candidate,'{payload}',(candidate->'payload')||jsonb_build_object('id',binding.outcome->>'recordId'));
  end if;
  proposal:=private.intake_proposal(member.business_id,candidate);
  update public.intake_items set status='superseded',review_version=review_version+1
    where source_id=source.id and external_id=btrim(p_external_id) and status in ('pending','needs_match');
  if proposal->>'status'='unchanged' then return null; end if;
  if (select count(*) from public.intake_items where business_id=member.business_id)>=10000 then raise exception 'LIMIT_REACHED'; end if;
  insert into public.intake_items(business_id,source_id,external_id,source_version,candidate,original_content,current_values,
    matched_record_id,matched_version,status,staged_by)
    values(member.business_id,source.id,btrim(p_external_id),btrim(p_source_version),proposal->'candidate',p_candidate,
      nullif(proposal->'current','null'::jsonb),(proposal->>'recordId')::uuid,(proposal->>'recordVersion')::integer,proposal->>'status',member.user_id)
    returning id into item_id;
  return item_id;
end $$;

create function public.amend_intake(p_item_id uuid,p_review_version integer,p_expected_revision bigint,p_candidate jsonb,p_note text)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); item public.intake_items; proposal jsonb; revision bigint; version integer;
begin
  select b.revision into revision from public.businesses b where id=member.business_id for update;
  select * into member from public.memberships where business_id=member.business_id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  if revision is distinct from p_expected_revision then raise exception 'STALE_VERSION'; end if;
  select * into item from public.intake_items where id=p_item_id and business_id=member.business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if item.review_version is distinct from p_review_version or item.status not in ('pending','needs_match') then raise exception 'STALE_VERSION'; end if;
  if p_note is null or length(btrim(p_note)) not between 1 and 4000 or p_candidate->>'type' is distinct from item.candidate->>'type' then raise exception 'VALIDATION_ERROR'; end if;
  if item.matched_record_id is not null and p_candidate->'payload'->>'id' is distinct from item.matched_record_id::text then raise exception 'STALE_VERSION'; end if;
  proposal:=private.intake_proposal(member.business_id,p_candidate,true);
  update public.intake_items set candidate=proposal->'candidate',current_values=nullif(proposal->'current','null'::jsonb),
    matched_record_id=(proposal->>'recordId')::uuid,matched_version=(proposal->>'recordVersion')::integer,status=proposal->>'status',
    review_version=review_version+1,reviewed_by=member.user_id,reviewed_at=now(),review_note=btrim(p_note)
    where id=item.id returning review_version into version;
  return version;
end $$;

-- A bounded batch retains independent row results; an invalid row cannot discard valid proposals.
create function public.stage_intake_batch(p_source_id uuid,p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); row_data jsonb; result jsonb:='[]'; item_id uuid;
  existing_id uuid; state text; message text;
begin
  perform 1 from public.businesses where id=member.business_id for update;
  perform 1 from public.intake_sources where id=p_source_id and business_id=member.business_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>524288 then raise exception 'VALIDATION_ERROR'; end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    begin
      perform private.assert_command_keys(row_data,array['externalId','sourceVersion','candidate','evidence']);
      if jsonb_typeof(row_data->'evidence')<>'object' or octet_length((row_data->'evidence')::text)>16384 then raise exception 'VALIDATION_ERROR'; end if;
      if (select count(*) from jsonb_array_elements(p_rows) r where btrim(r->>'externalId')=btrim(row_data->>'externalId'))>1 then raise exception 'VALIDATION_ERROR'; end if;
      select id into existing_id from public.intake_items where source_id=p_source_id and external_id=btrim(row_data->>'externalId') and source_version=btrim(row_data->>'sourceVersion');
      item_id:=public.stage_intake(p_source_id,row_data->>'externalId',row_data->>'sourceVersion',row_data->'candidate');
      state:='unchanged';
      if item_id is not null then
        if existing_id is null then update public.intake_items set source_evidence=row_data->'evidence' where id=item_id; end if;
        select status into state from public.intake_items where id=item_id;
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('externalId',row_data->>'externalId','itemId',item_id,'status',state,'replayed',existing_id is not null));
    exception when others then
      get stacked diagnostics message=message_text;
      result:=result||jsonb_build_array(jsonb_build_object('externalId',row_data->>'externalId','status','error','code',
        case when message in ('NOT_FOUND','FORBIDDEN','STALE_VERSION','LIMIT_REACHED') then message else 'VALIDATION_ERROR' end));
    end;
  end loop;
  return result;
end $$;

create function public.get_intake_bindings(p_source_id uuid,p_external_ids text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); result jsonb;
begin
  if p_external_ids is null or cardinality(p_external_ids)>100 then raise exception 'VALIDATION_ERROR'; end if;
  perform 1 from public.intake_sources where id=p_source_id and business_id=member.business_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('externalId',external_id,'type',candidate->>'type','recordId',outcome->>'recordId')),'[]') into result from (
    select distinct on(external_id) external_id,candidate,outcome from public.intake_items
    where business_id=member.business_id and source_id=p_source_id and external_id=any(p_external_ids) and status='applied'
    order by external_id,observed_at desc,id desc
  ) bindings;
  return result;
end $$;

-- Serialize review decisions with staging and application using the same business-first lock order.
create or replace function public.review_intake(p_item_id uuid,p_review_version integer,p_decision text,p_reason text)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); item public.intake_items; version integer;
begin
  perform 1 from public.businesses where id=member.business_id for update;
  select * into member from public.memberships where business_id=member.business_id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into item from public.intake_items where id=p_item_id and business_id=member.business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if item.review_version is distinct from p_review_version or item.status not in ('pending','needs_match') then raise exception 'STALE_VERSION'; end if;
  if p_decision is null or p_decision not in ('reject','clarify') or p_reason is null or length(btrim(p_reason)) not between 1 and 4000 then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_items set status=case when p_decision='reject' then 'rejected' else 'needs_match' end,
    review_version=review_version+1,reviewed_by=member.user_id,reviewed_at=now(),review_note=btrim(p_reason)
    where id=item.id returning review_version into version;
  return version;
end $$;

revoke all on function public.amend_intake(uuid,integer,bigint,jsonb,text),public.stage_intake_batch(uuid,jsonb),public.get_intake_bindings(uuid,text[]) from public,anon,authenticated;
grant execute on function public.amend_intake(uuid,integer,bigint,jsonb,text),public.stage_intake_batch(uuid,jsonb),public.get_intake_bindings(uuid,text[]) to authenticated;
