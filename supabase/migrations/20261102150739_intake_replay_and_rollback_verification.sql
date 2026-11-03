-- A repeated observation also supersedes obsolete, unapplied versions of that source row.
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
    update public.intake_items set status='superseded',review_version=review_version+1
      where source_id=source.id and external_id=btrim(p_external_id) and id<>old_item.id and status in ('pending','needs_match');
    if old_item.status<>'superseded' then return old_item.id; end if;
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
  if old_item.status='superseded' then
    update public.intake_items set candidate=proposal->'candidate',current_values=nullif(proposal->'current','null'::jsonb),
      matched_record_id=(proposal->>'recordId')::uuid,matched_version=(proposal->>'recordVersion')::integer,
      status=proposal->>'status',review_version=review_version+1
      where id=old_item.id returning id into item_id;
  else
  insert into public.intake_items(business_id,source_id,external_id,source_version,candidate,original_content,current_values,
    matched_record_id,matched_version,status,staged_by)
    values(member.business_id,source.id,btrim(p_external_id),btrim(p_source_version),proposal->'candidate',p_candidate,
      nullif(proposal->'current','null'::jsonb),(proposal->>'recordId')::uuid,(proposal->>'recordVersion')::integer,proposal->>'status',member.user_id)
    returning id into item_id;
  end if;
  return item_id;
end $$;

-- Force an outcome-write failure after the core command. The fixture and fault DDL roll back together.
do $verify$
declare b uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); source_id uuid; item_id uuid; result jsonb; retried jsonb;
begin
  begin
    insert into auth.users(id,aud,role,email) values(u,'authenticated','authenticated','intake-rollback-'||u::text||'@example.invalid');
    insert into public.businesses(id,name,opening_date,opening_cash_cents,is_demo,demo_reference_date)
      values(b,'test-'||b::text,'2026-10-29',4000000,true,'2026-10-29');
    insert into public.memberships(business_id,user_id,role,display_name) values(b,u,'owner','Intake rollback verification');
    insert into public.customers(id,business_id,name,contact_name) values(c,b,'Fictional rollback customer','Test contact');
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    source_id:=public.create_intake_source('manual_csv','Rollback verification');
    item_id:=public.stage_intake(source_id,'rollback-outcome','1',jsonb_build_object('type','save_invoice','payload',
      jsonb_build_object('number','ROLLBACK-ONLY','customerId',c,'amountCents',10000,'dueDate','2026-11-05')));
    execute $ddl$create function private.intake_outcome_fault() returns trigger language plpgsql set search_path='' as $fault$
      begin
        if new.external_id='rollback-outcome' and new.status='applied' and exists(select 1 from public.businesses x where x.id=new.business_id and x.is_demo and x.name='test-'||x.id::text)
          then raise exception 'INTAKE_EXPECTED_OUTCOME_FAILURE'; end if;
        return new;
      end $fault$ $ddl$;
    execute 'create trigger intake_outcome_fault before update on public.intake_items for each row execute function private.intake_outcome_fault()';
    begin
      perform public.apply_intake(item_id,1,0);
      raise exception 'Expected outcome failure did not occur';
    exception when raise_exception then
      if sqlerrm<>'INTAKE_EXPECTED_OUTCOME_FAILURE' then raise; end if;
    end;
    if (select revision from public.businesses where id=b)<>0 or
      exists(select 1 from public.invoices where business_id=b) or
      exists(select 1 from public.expectations where business_id=b) or
      exists(select 1 from public.audit_events where business_id=b) or
      exists(select 1 from public.command_receipts where business_id=b) or
      exists(select 1 from public.cash_movements where business_id=b) or
      (select status from public.intake_items where id=item_id)<>'pending' then
      raise exception 'Intake outcome failure left partial financial writes';
    end if;
    execute 'drop trigger intake_outcome_fault on public.intake_items';
    result:=public.apply_intake(item_id,1,0);
    retried:=public.apply_intake(item_id,1,0);
    if result->>'recordId' is distinct from retried->>'recordId' or retried->>'replayed'<>'true' or
      (select count(*) from public.invoices where business_id=b)<>1 or
      (select count(*) from public.command_receipts where business_id=b)<>1 or
      (select revision from public.businesses where id=b)<>1 then raise exception 'Intake retry was not idempotent'; end if;
    raise exception 'INTAKE_ROLLBACK_VERIFIED';
  exception when raise_exception then
    if sqlerrm<>'INTAKE_ROLLBACK_VERIFIED' then raise; end if;
  end;
end $verify$;
