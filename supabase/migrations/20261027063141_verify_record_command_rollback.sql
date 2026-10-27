-- Conditional development verification. All fault objects are created and removed in one statement.
do $verify$
declare
  v_business uuid;
  v_actor uuid;
  v_customer uuid;
  v_revision bigint;
  v_before_invoices bigint;
  v_before_expectations bigint;
  v_before_audits bigint;
  v_before_receipts bigint;
  v_request uuid;
  v_number text;
  v_passed integer := 0;
  v_count integer;
begin
  select count(*) into v_count from public.businesses b join public.customers c on c.business_id=b.id
    where b.is_demo and b.name='test-'||b.id::text and c.name='Task 4 rollback verification fixture';
  if v_count = 0 then return; end if;
  if v_count <> 1 then raise exception 'Rollback verification requires exactly one disposable fixture'; end if;
  select b.id,m.user_id,c.id,b.revision into strict v_business,v_actor,v_customer,v_revision
    from public.businesses b join public.customers c on c.business_id=b.id
    join public.memberships m on m.business_id=b.id and m.role='owner'
    where b.is_demo and b.name='test-'||b.id::text and c.name='Task 4 rollback verification fixture';
  select count(*) into v_before_invoices from public.invoices where business_id=v_business;
  select count(*) into v_before_expectations from public.expectations where business_id=v_business;
  select count(*) into v_before_audits from public.audit_events where business_id=v_business;
  select count(*) into v_before_receipts from public.command_receipts where business_id=v_business;

  execute $ddl$
    create function private.task4_write_fault() returns trigger language plpgsql set search_path='' as $fault$
    begin
      if tg_table_name='audit_events' then
        if new.entity_kind='invoice' and new.change->'after'->>'number'='TASK4-AUDIT-ROLLBACK' and
          exists(select 1 from public.businesses b where b.id=new.business_id and b.is_demo and b.name='test-'||b.id::text) then
          raise exception 'TASK4_EXPECTED_WRITE_FAILURE';
        end if;
      elsif tg_table_name='command_receipts' then
        if exists(select 1 from public.invoices i join public.businesses b on b.id=i.business_id
          where i.id=(new.result->>'recordId')::uuid and i.business_id=new.business_id and i.number='TASK4-RECEIPT-ROLLBACK'
          and b.is_demo and b.name='test-'||b.id::text) then raise exception 'TASK4_EXPECTED_WRITE_FAILURE'; end if;
      end if;
      return new;
    end $fault$
  $ddl$;
  execute 'create trigger task4_audit_fault before insert on public.audit_events for each row execute function private.task4_write_fault()';
  execute 'create trigger task4_receipt_fault before insert on public.command_receipts for each row execute function private.task4_write_fault()';

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach v_number in array array['TASK4-AUDIT-ROLLBACK','TASK4-RECEIPT-ROLLBACK'] loop
    v_request := gen_random_uuid();
    begin
      perform public.workspace_command(jsonb_build_object('requestId',v_request,'expectedRevision',v_revision,
        'type','save_invoice','payload',jsonb_build_object('number',v_number,'customerId',v_customer,'amountCents',100,'dueDate','2026-10-30')));
      raise exception 'Expected failure did not occur';
    exception when raise_exception then
      if sqlerrm <> 'TASK4_EXPECTED_WRITE_FAILURE' then raise; end if;
    end;
    if (select revision from public.businesses where id=v_business) <> v_revision or
       (select count(*) from public.invoices where business_id=v_business) <> v_before_invoices or
       (select count(*) from public.expectations where business_id=v_business) <> v_before_expectations or
       (select count(*) from public.audit_events where business_id=v_business) <> v_before_audits or
       (select count(*) from public.command_receipts where business_id=v_business) <> v_before_receipts or
       exists(select 1 from public.command_receipts where business_id=v_business and request_id=v_request) then
      raise exception 'Record command left partial writes after forced failure';
    end if;
    v_passed := v_passed + 1;
  end loop;
  if v_passed <> 2 then raise exception 'Both rollback probes must run'; end if;
  execute 'reset role';
  execute 'drop trigger task4_audit_fault on public.audit_events';
  execute 'drop trigger task4_receipt_fault on public.command_receipts';
  execute 'drop function private.task4_write_fault()';
end $verify$;
