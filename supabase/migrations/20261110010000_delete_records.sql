-- Delete an invoice or bill that was entered by mistake.
-- Safe by design: a record with any payment history (including voided payments) cannot be deleted, because those
-- payments are retained financial history. The full record and everything removed with it is kept in the audit log.
create function private.delete_workspace_record(p_command jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  business public.businesses;
  receipt public.command_receipts;
  v_request_id uuid;
  v_expected bigint;
  v_type text;
  v_payload jsonb;
  v_digest text;
  v_id uuid;
  v_reason text;
  v_kind text;
  v_before jsonb;
  v_children jsonb := '{}'::jsonb;
  v_revision bigint;
  result jsonb;
begin
  perform private.assert_command_keys(p_command,array['requestId','expectedRevision','type','payload']);
  v_request_id := private.command_uuid(p_command,'requestId');
  v_expected := private.command_integer(p_command,'expectedRevision',0,9007199254740991);
  v_type := private.command_text(p_command,'type',64);
  v_payload := p_command->'payload';
  if v_type not in ('delete_invoice','delete_expense') then raise exception 'VALIDATION_ERROR'; end if;
  perform private.assert_command_keys(v_payload,array['id','reason']);
  v_id := private.command_uuid(v_payload,'id');
  v_reason := private.command_text(v_payload,'reason',4000);

  select * into business from public.businesses where id = member.business_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  -- Recheck after the business lock and hold membership against concurrent revocation.
  select * into member from public.memberships
    where business_id = business.id and user_id = auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;

  v_digest := encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into receipt from public.command_receipts c
    where c.business_id = business.id and c.request_id = v_request_id;
  if found then
    if receipt.payload_digest <> v_digest then raise exception 'REQUEST_ID_REUSE'; end if;
    return receipt.result || jsonb_build_object('replayed',true);
  end if;
  if business.revision <> v_expected then raise exception 'STALE_VERSION'; end if;
  if business.revision >= 9007199254740991 then raise exception 'LIMIT_REACHED'; end if;

  if v_type = 'delete_invoice' then
    v_kind := 'invoice';
    select to_jsonb(i.*) into v_before from public.invoices i
      where i.id = v_id and i.business_id = business.id for update;
    if v_before is null then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from public.cash_movements where invoice_id = v_id and business_id = business.id) then
      raise exception 'HAS_PAYMENTS';
    end if;
    v_children := jsonb_build_object(
      'reminders',(select coalesce(jsonb_agg(to_jsonb(r.*)),'[]'::jsonb) from public.reminders r where r.invoice_id = v_id and r.business_id = business.id),
      'followups',(select coalesce(jsonb_agg(to_jsonb(f.*)),'[]'::jsonb) from public.followups f where f.invoice_id = v_id and f.business_id = business.id),
      'expectations',(select coalesce(jsonb_agg(to_jsonb(e.*)),'[]'::jsonb) from public.expectations e where e.invoice_id = v_id and e.business_id = business.id));
    delete from public.reminders where invoice_id = v_id and business_id = business.id;
    delete from public.followups where invoice_id = v_id and business_id = business.id;
    delete from public.expectations where invoice_id = v_id and business_id = business.id;
    delete from public.invoices where id = v_id and business_id = business.id;
  else
    v_kind := 'expense';
    select to_jsonb(x.*) into v_before from public.expenses x
      where x.id = v_id and x.business_id = business.id for update;
    if v_before is null then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from public.cash_movements where expense_id = v_id and business_id = business.id) then
      raise exception 'HAS_PAYMENTS';
    end if;
    delete from public.expenses where id = v_id and business_id = business.id;
  end if;

  insert into public.audit_events (business_id,actor_id,entity_kind,entity_id,change,reason)
    values (business.id,member.user_id,v_kind,v_id,
      jsonb_build_object('before',v_before,'after',null,'deleted',true,'removedWithIt',v_children),v_reason);
  update public.businesses set revision = revision + 1 where id = business.id returning revision into v_revision;
  result := jsonb_build_object('revision',v_revision,'recordId',v_id,'replayed',false);
  insert into public.command_receipts (business_id,request_id,payload_digest,result)
    values (business.id,v_request_id,v_digest,result);
  return result;
exception
  when foreign_key_violation then raise exception 'HAS_PAYMENTS';
  when unique_violation then raise exception 'DUPLICATE_REFERENCE';
  when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception 'VALIDATION_ERROR';
end $$;

create function public.delete_workspace_record(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.delete_workspace_record(p_command)
$$;
revoke all on function private.delete_workspace_record(jsonb), public.delete_workspace_record(jsonb) from public, anon, authenticated;
grant execute on function private.delete_workspace_record(jsonb), public.delete_workspace_record(jsonb) to authenticated;
