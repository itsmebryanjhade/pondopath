create or replace function private.reminder_command(p_command jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_member public.memberships:=private.require_membership();
  v_business public.businesses;
  v_receipt public.command_receipts;
  v_reminder public.reminders;
  v_invoice public.invoices;
  v_customer public.customers;
  v_request uuid;
  v_expected bigint;
  v_type text;
  v_payload jsonb;
  v_digest text;
  v_basis text;
  v_id uuid;
  v_invoice_id uuid;
  v_version integer;
  v_recipient text;
  v_body text;
  v_reason text;
  v_channel text;
  v_sent_at timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  perform private.assert_command_keys(p_command,array['requestId','expectedRevision','type','payload']);
  v_request:=private.command_uuid(p_command,'requestId');
  v_expected:=private.command_integer(p_command,'expectedRevision',0,9007199254740991);
  v_type:=private.command_text(p_command,'type',64);
  v_payload:=p_command->'payload';
  if v_type not in ('save_reminder','submit_reminder','approve_reminder','reject_reminder','report_manual_send') then raise exception 'VALIDATION_ERROR'; end if;
  select * into v_business from public.businesses where id=v_member.business_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_member from public.memberships where business_id=v_business.id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  v_digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into v_receipt from public.command_receipts where business_id=v_business.id and request_id=v_request;
  if found then
    if v_receipt.payload_digest<>v_digest then raise exception 'REQUEST_ID_REUSE'; end if;
    return v_receipt.result||jsonb_build_object('replayed',true);
  end if;
  if v_business.revision<>v_expected then raise exception 'STALE_VERSION'; end if;
  if v_business.revision>=9007199254740991 then raise exception 'LIMIT_REACHED'; end if;

  if v_type='save_reminder' then
    perform private.assert_command_keys(v_payload,array['invoiceId','recipient','body'],array['id']);
    v_id:=private.command_uuid(v_payload,'id',true);
    v_invoice_id:=private.command_uuid(v_payload,'invoiceId');
    v_recipient:=private.command_text(v_payload,'recipient',200);
    v_body:=private.command_text(v_payload,'body',2000);
    select * into v_invoice from public.invoices where id=v_invoice_id and business_id=v_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select * into v_customer from public.customers where id=v_invoice.customer_id and business_id=v_business.id for key share;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_invoice.amount_cents-(select coalesce(sum(amount_cents),0) from public.cash_movements
      where business_id=v_business.id and invoice_id=v_invoice.id and voided_at is null)<=0 then raise exception 'VALIDATION_ERROR'; end if;
    if v_id is not null then
      select * into v_reminder from public.reminders where id=v_id and business_id=v_business.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if v_reminder.invoice_id<>v_invoice.id or v_reminder.state='reported_sent' then raise exception 'VALIDATION_ERROR'; end if;
    else
      select * into v_reminder from public.reminders where business_id=v_business.id and invoice_id=v_invoice.id
        and state<>'reported_sent' order by updated_at desc,id desc limit 1 for update;
      if found then v_id:=v_reminder.id; end if;
    end if;
    v_before:=case when v_reminder.id is null then null else to_jsonb(v_reminder) end;
    if v_id is null then
      insert into public.reminders(business_id,invoice_id,recipient,body)
        values(v_business.id,v_invoice.id,v_recipient,v_body) returning id,to_jsonb(reminders.*) into v_id,v_after;
    else
      update public.reminders set recipient=v_recipient,body=v_body,state='draft',approval_basis=null,reviewed_by=null,reviewed_at=null,
        rejection_reason=null,approved_version=null,approved_body=null,approved_recipient=null,reported_sent_at=null,reported_channel=null,reported_by=null,
        version=version+1,updated_at=now() where id=v_id returning to_jsonb(reminders.*) into v_after;
    end if;
  else
    perform private.assert_command_keys(v_payload,
      case when v_type in ('approve_reminder','reject_reminder') then array['id','reminderVersion','approvalBasis']::text[]
        when v_type='report_manual_send' then array['id','reminderVersion','channel','sentAt']::text[]
        else array['id','reminderVersion']::text[] end,
      case when v_type='reject_reminder' then array['reason']::text[] else array[]::text[] end);
    v_id:=private.command_uuid(v_payload,'id');
    v_version:=private.command_integer(v_payload,'reminderVersion',1,2147483647);
    select * into v_reminder from public.reminders where id=v_id and business_id=v_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select * into v_invoice from public.invoices where id=v_reminder.invoice_id and business_id=v_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_reminder.version<>v_version then raise exception 'STALE_VERSION'; end if;
    v_before:=to_jsonb(v_reminder);

    if v_type='submit_reminder' then
      if v_reminder.state not in ('draft','rejected','awaiting_review') or v_reminder.body='' or v_reminder.recipient='' then raise exception 'VALIDATION_ERROR'; end if;
      if v_invoice.amount_cents-(select coalesce(sum(amount_cents),0) from public.cash_movements
        where business_id=v_business.id and invoice_id=v_invoice.id and voided_at is null)<=0 then raise exception 'VALIDATION_ERROR'; end if;
      v_basis:=private.reminder_basis(v_business.id,v_invoice.id);
      update public.reminders set state='awaiting_review',approval_basis=jsonb_build_object('digest',v_basis),reviewed_by=null,reviewed_at=null,
        rejection_reason=null,approved_version=null,approved_body=null,approved_recipient=null,reported_sent_at=null,reported_channel=null,reported_by=null,
        version=version+1,updated_at=now() where id=v_id returning to_jsonb(reminders.*) into v_after;
    elsif v_type in ('approve_reminder','reject_reminder') then
      if v_member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
      v_basis:=private.reminder_basis(v_business.id,v_invoice.id);
      if v_reminder.state<>'awaiting_review' or v_reminder.approval_basis->>'digest' is distinct from v_basis
        or private.command_text(v_payload,'approvalBasis',64)<>v_basis then raise exception 'STALE_VERSION'; end if;
      if v_type='approve_reminder' then
        update public.reminders set state='approved',approved_version=version,approved_body=body,approved_recipient=recipient,
          reviewed_by=v_member.user_id,reviewed_at=now(),rejection_reason=null,version=version+1,updated_at=now()
          where id=v_id returning to_jsonb(reminders.*) into v_after;
      else
        v_reason:=private.command_text(v_payload,'reason',4000);
        update public.reminders set state='rejected',approval_basis=null,reviewed_by=v_member.user_id,reviewed_at=now(),rejection_reason=v_reason,
          approved_version=null,approved_body=null,approved_recipient=null,version=version+1,updated_at=now()
          where id=v_id returning to_jsonb(reminders.*) into v_after;
      end if;
    else
      v_basis:=private.reminder_basis(v_business.id,v_invoice.id);
      if v_reminder.state<>'approved' or v_reminder.approval_basis->>'digest' is distinct from v_basis
        or v_reminder.approved_version is null or v_reminder.approved_body is distinct from v_reminder.body
        or v_reminder.approved_recipient is distinct from v_reminder.recipient then raise exception 'STALE_VERSION'; end if;
      v_channel:=private.command_text(v_payload,'channel',200);
      v_reason:=private.command_text(v_payload,'sentAt',100);
      if v_reason !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'VALIDATION_ERROR'; end if;
      v_sent_at:=v_reason::timestamptz;
      update public.reminders set state='reported_sent',reported_channel=v_channel,reported_sent_at=v_sent_at,reported_by=v_member.user_id,
        version=version+1,updated_at=now() where id=v_id returning to_jsonb(reminders.*) into v_after;
    end if;
  end if;

  insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
    values(v_business.id,v_member.user_id,'reminder',v_id,jsonb_build_object('operation',v_type,'before',v_before,'after',v_after,'invoiceId',coalesce(v_invoice_id,v_reminder.invoice_id)),
      case when v_type='reject_reminder' then v_reason else null end);
  update public.businesses set revision=revision+1 where id=v_business.id returning revision into v_expected;
  v_result:=jsonb_build_object('revision',v_expected,'recordId',v_id,'replayed',false);
  insert into public.command_receipts(business_id,request_id,payload_digest,result) values(v_business.id,v_request,v_digest,v_result);
  return v_result;
exception
  when unique_violation then raise exception 'DUPLICATE_REFERENCE';
  when foreign_key_violation then raise exception 'NOT_FOUND';
  when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then raise exception 'VALIDATION_ERROR';
end $$;
