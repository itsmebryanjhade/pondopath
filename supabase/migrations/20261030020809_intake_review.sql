-- Intake is business-scoped and read-only until a member explicitly applies an item.
create table public.intake_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  kind text not null check (kind in ('manual_csv','manual_xlsx','google_sheet','drive_file','onedrive_file','message','image')),
  label text not null check (length(btrim(label)) between 1 and 200),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id,business_id)
);

create table public.intake_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  source_id uuid not null,
  external_id text not null check (length(btrim(external_id)) between 1 and 200),
  source_version text not null check (length(btrim(source_version)) between 1 and 200),
  candidate jsonb not null,
  original_content jsonb not null,
  current_values jsonb,
  matched_record_id uuid,
  matched_version integer,
  status text not null default 'pending' check (status in ('pending','needs_match','superseded','rejected','applied')),
  review_version integer not null default 1 check (review_version > 0),
  observed_at timestamptz not null default now(),
  staged_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (length(btrim(review_note)) between 1 and 4000),
  outcome jsonb,
  unique (source_id,external_id,source_version),
  foreign key (source_id,business_id) references public.intake_sources (id,business_id)
);
create index intake_items_business_status_idx on public.intake_items (business_id,status,observed_at desc);

alter table public.intake_sources enable row level security;
alter table public.intake_items enable row level security;
create policy intake_sources_member_read on public.intake_sources for select to authenticated
  using (business_id in (select business_id from public.memberships where user_id = (select auth.uid())));
create policy intake_items_member_read on public.intake_items for select to authenticated
  using (business_id in (select business_id from public.memberships where user_id = (select auth.uid())));
revoke all on public.intake_sources,public.intake_items from public,anon,authenticated;
grant select on public.intake_sources,public.intake_items to authenticated;
grant all on public.intake_sources,public.intake_items to service_role;

-- Only a signed-in owner can configure a source. This creates metadata, not provider access.
create function public.create_intake_source(p_kind text,p_label text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare member public.memberships := private.require_membership(); v_id uuid;
begin
  if member.role <> 'owner' then raise exception 'FORBIDDEN'; end if;
  if p_kind is null or p_kind not in ('manual_csv','manual_xlsx') or
     p_label is null or length(btrim(p_label)) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  if (select count(*) from public.intake_sources where business_id=member.business_id) >= 20 then
    raise exception 'LIMIT_REACHED';
  end if;
  insert into public.intake_sources(business_id,kind,label,created_by)
    values(member.business_id,p_kind,btrim(p_label),member.user_id) returning id into v_id;
  return v_id;
end $$;

-- The source/version key makes repeated intake safe. Structured proposals are validated in SQL too.
create function public.stage_intake(p_source_id uuid,p_external_id text,p_source_version text,p_candidate jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  source public.intake_sources;
  old_item public.intake_items;
  v_type text;
  v_payload jsonb;
  v_id uuid;
  v_number text;
  v_label text;
  v_payee text;
  v_record_id uuid;
  v_current jsonb;
  v_version integer;
  v_status text := 'pending';
begin
  if p_external_id is null or length(btrim(p_external_id)) not between 1 and 200 or
     p_source_version is null or length(btrim(p_source_version)) not between 1 and 200 then
    raise exception 'VALIDATION_ERROR';
  end if;
  select * into source from public.intake_sources
    where id=p_source_id and business_id=member.business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into old_item from public.intake_items
    where source_id=source.id and external_id=btrim(p_external_id) and source_version=btrim(p_source_version);
  if found then
    if old_item.original_content <> p_candidate then raise exception 'STALE_VERSION'; end if;
    return old_item.id;
  end if;
  perform private.assert_command_keys(p_candidate,array['type','payload']);
  v_type := private.command_text(p_candidate,'type',64);
  v_payload := p_candidate->'payload';
  if v_type='save_invoice' then
    perform private.assert_command_keys(v_payload,array['number','customerId','amountCents','dueDate'],array['id']);
    v_record_id := private.command_uuid(v_payload,'id',true);
    v_number := private.command_text(v_payload,'number',100);
    perform private.command_integer(v_payload,'amountCents',1,99999999999);
    perform private.command_date(v_payload,'dueDate');
    perform 1 from public.customers where id=private.command_uuid(v_payload,'customerId') and business_id=member.business_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_record_id is null then
      select id into v_record_id from public.invoices where business_id=member.business_id and number=v_number;
    end if;
    if v_record_id is not null then
      select to_jsonb(i),version into v_current,v_version from public.invoices i
        where id=v_record_id and business_id=member.business_id;
      if not found then raise exception 'NOT_FOUND'; end if;
      v_payload := v_payload || jsonb_build_object('id',v_record_id);
    end if;
  elsif v_type='save_expense' then
    perform private.assert_command_keys(v_payload,array['label','payee','amountCents','dueDate'],array['id']);
    v_record_id := private.command_uuid(v_payload,'id',true);
    v_label := private.command_text(v_payload,'label',200);
    v_payee := private.command_text(v_payload,'payee',200);
    perform private.command_integer(v_payload,'amountCents',1,99999999999);
    perform private.command_date(v_payload,'dueDate');
    if v_record_id is not null then
      select to_jsonb(e),version into v_current,v_version from public.expenses e
        where id=v_record_id and business_id=member.business_id;
      if not found then raise exception 'NOT_FOUND'; end if;
    elsif exists (select 1 from public.expenses e where e.business_id=member.business_id
      and e.label=v_label and e.payee=v_payee and e.amount_cents=(v_payload->>'amountCents')::bigint
      and e.due_date=(v_payload->>'dueDate')::date) then
      v_status := 'needs_match';
    end if;
  else
    raise exception 'VALIDATION_ERROR';
  end if;

  if v_current is not null and (
    (v_type='save_invoice' and v_current->>'number'=v_payload->>'number'
      and v_current->>'customer_id'=v_payload->>'customerId'
      and (v_current->>'amount_cents')::bigint=(v_payload->>'amountCents')::bigint
      and v_current->>'due_date'=v_payload->>'dueDate') or
    (v_type='save_expense' and v_current->>'label'=v_payload->>'label'
      and v_current->>'payee'=v_payload->>'payee'
      and (v_current->>'amount_cents')::bigint=(v_payload->>'amountCents')::bigint
      and v_current->>'due_date'=v_payload->>'dueDate')
  ) then
    update public.intake_items set status='superseded',review_version=review_version+1
      where source_id=source.id and external_id=btrim(p_external_id) and status in ('pending','needs_match');
    return null;
  end if;
  if (select count(*) from public.intake_items where business_id=member.business_id) >= 10000 then
    raise exception 'LIMIT_REACHED';
  end if;

  update public.intake_items set status='superseded',review_version=review_version+1
    where source_id=source.id and external_id=btrim(p_external_id) and status in ('pending','needs_match');
  insert into public.intake_items(business_id,source_id,external_id,source_version,candidate,original_content,
    current_values,matched_record_id,matched_version,status,staged_by)
    values(member.business_id,source.id,btrim(p_external_id),btrim(p_source_version),
      jsonb_build_object('type',v_type,'payload',v_payload),p_candidate,v_current,v_record_id,v_version,v_status,member.user_id)
    returning id into v_id;
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'VALIDATION_ERROR';
end $$;

-- The command and intake outcome commit together. A repeated confirmation returns the saved result.
create function public.apply_intake(p_item_id uuid,p_review_version integer,p_expected_revision bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  business public.businesses;
  item public.intake_items;
  current_version integer;
  result jsonb;
begin
  select * into business from public.businesses where id=member.business_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into member from public.memberships where business_id=business.id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into item from public.intake_items where id=p_item_id and business_id=business.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_review_version is distinct from item.review_version then raise exception 'STALE_VERSION'; end if;
  if item.status='applied' then return item.outcome || jsonb_build_object('replayed',true); end if;
  if item.status<>'pending' then raise exception 'VALIDATION_ERROR'; end if;
  if item.matched_record_id is not null then
    if item.candidate->>'type'='save_invoice' then
      select version into current_version from public.invoices where id=item.matched_record_id and business_id=business.id;
    else
      select version into current_version from public.expenses where id=item.matched_record_id and business_id=business.id;
    end if;
    if current_version is distinct from item.matched_version then raise exception 'STALE_VERSION'; end if;
  elsif item.candidate->>'type'='save_invoice' and exists (
    select 1 from public.invoices where business_id=business.id and number=item.candidate->'payload'->>'number') then
    raise exception 'STALE_VERSION';
  elsif item.candidate->>'type'='save_expense' and exists (
    select 1 from public.expenses where business_id=business.id
      and label=item.candidate->'payload'->>'label' and payee=item.candidate->'payload'->>'payee'
      and amount_cents=(item.candidate->'payload'->>'amountCents')::bigint
      and due_date=(item.candidate->'payload'->>'dueDate')::date) then
    raise exception 'POSSIBLE_DUPLICATE';
  end if;
  if p_expected_revision is null or p_expected_revision<>business.revision then raise exception 'STALE_VERSION'; end if;
  result := private.workspace_command(item.candidate || jsonb_build_object(
    'requestId',item.id,'expectedRevision',p_expected_revision));
  update public.intake_items set status='applied',reviewed_by=member.user_id,reviewed_at=now(),outcome=result
    where id=item.id;
  return result;
end $$;

create function public.review_intake(p_item_id uuid,p_review_version integer,p_decision text,p_reason text)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare member public.memberships := private.require_membership(); item public.intake_items; v_version integer;
begin
  select * into item from public.intake_items where id=p_item_id and business_id=member.business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if item.review_version is distinct from p_review_version or item.status not in ('pending','needs_match') then
    raise exception 'STALE_VERSION';
  end if;
  if p_decision is null or p_decision not in ('reject','clarify') or
     p_reason is null or length(btrim(p_reason)) not between 1 and 4000 then
    raise exception 'VALIDATION_ERROR';
  end if;
  update public.intake_items set status=case when p_decision='reject' then 'rejected' else 'needs_match' end,
    review_version=review_version+1,reviewed_by=member.user_id,reviewed_at=now(),review_note=btrim(p_reason)
    where id=item.id returning review_version into v_version;
  return v_version;
end $$;

revoke all on function public.create_intake_source(text,text),
  public.stage_intake(uuid,text,text,jsonb),public.apply_intake(uuid,integer,bigint),
  public.review_intake(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.create_intake_source(text,text),
  public.stage_intake(uuid,text,text,jsonb),public.apply_intake(uuid,integer,bigint),
  public.review_intake(uuid,integer,text,text) to authenticated;
