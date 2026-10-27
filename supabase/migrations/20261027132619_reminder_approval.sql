alter table public.reminders
  add column approved_version integer,
  add column approved_body text,
  add column approved_recipient text,
  add column reported_by uuid,
  add constraint reminders_approved_snapshot_check check (
    (state in ('approved','reported_sent') and approval_basis is not null and approved_version is not null
      and approved_body is not null and approved_recipient is not null and reviewed_by is not null and reviewed_at is not null)
    or (state not in ('approved','reported_sent') and approved_version is null and approved_body is null and approved_recipient is null)
  );

create or replace function private.reminder_basis(p_business uuid,p_invoice uuid) returns text
language plpgsql stable set search_path='' as $$
declare
  v_invoice public.invoices;
  v_customer public.customers;
  v_expectation public.expectations;
  v_outstanding numeric;
  v_reference date;
begin
  select * into v_invoice from public.invoices where id=p_invoice and business_id=p_business;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_customer from public.customers where id=v_invoice.customer_id and business_id=p_business;
  select * into v_expectation from public.expectations where business_id=p_business and invoice_id=p_invoice
    and state in ('active','needs_review') order by confirmed_at desc,id limit 1;
  select v_invoice.amount_cents-coalesce(sum(m.amount_cents),0) into v_outstanding from public.cash_movements m
    where m.business_id=p_business and m.invoice_id=p_invoice and m.voided_at is null;
  v_reference:=private.reference_date(p_business);
  return encode(sha256(convert_to(concat_ws(chr(31),v_invoice.id::text,v_invoice.version::text,v_outstanding::text,
    v_customer.version::text,coalesce(v_expectation.id::text,''),coalesce(v_expectation.version::text,''),v_reference::text),'UTF8')),'hex');
end $$;

create function private.reminder_command(p_command jsonb) returns jsonb
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

  insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
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

create function private.checked_approved_reminder_text(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_member public.memberships:=private.require_membership();
  v_business public.businesses;
  v_reminder public.reminders;
  v_basis text;
  v_next_revision bigint;
  v_after jsonb;
begin
  select * into v_business from public.businesses where id=v_member.business_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_member from public.memberships where business_id=v_business.id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_reminder from public.reminders where id=p_id and business_id=v_business.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_reminder.state<>'approved' then return jsonb_build_object('text',null,'stale',false); end if;
  v_basis:=private.reminder_basis(v_business.id,v_reminder.invoice_id);
  if v_reminder.approval_basis->>'digest' is distinct from v_basis or v_reminder.approved_version is null
    or v_reminder.approved_body is distinct from v_reminder.body or v_reminder.approved_recipient is distinct from v_reminder.recipient then
    update public.reminders set state='draft',approval_basis=null,reviewed_by=null,reviewed_at=null,
      approved_version=null,approved_body=null,approved_recipient=null,rejection_reason=null,
      version=version+1,updated_at=now() where id=p_id returning to_jsonb(reminders.*) into v_after;
    insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
      values(v_business.id,v_member.user_id,'reminder',p_id,jsonb_build_object('before',to_jsonb(v_reminder),'after',v_after,'invoiceId',v_reminder.invoice_id),
        'The invoice, contact, expected receipt, or reference date changed; reminder approval invalidated.');
    update public.businesses set revision=revision+1 where id=v_business.id returning revision into v_next_revision;
    return jsonb_build_object('text',null,'stale',true,'revision',v_next_revision);
  end if;
  return jsonb_build_object('text',v_reminder.approved_body,'stale',false);
end $$;

create or replace function public.workspace_command(p_command jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_command->>'type' in ('save_reminder','submit_reminder','approve_reminder','reject_reminder','report_manual_send') then
    return private.reminder_command(p_command);
  end if;
  return private.workspace_command(p_command);
end $$;

create function public.get_approved_reminder_text(p_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select private.checked_approved_reminder_text(p_id)
$$;

create or replace function private.invalidate_reminders(p_business uuid,p_actor uuid,p_invoice uuid,p_customer uuid)
returns void language plpgsql set search_path = '' as $$
declare v_old public.reminders; v_after jsonb;
begin
  if (p_invoice is null) = (p_customer is null) then raise exception 'VALIDATION_ERROR'; end if;
  for v_old in select r.* from public.reminders r where r.business_id=p_business and r.state in ('awaiting_review','approved')
    and (r.invoice_id=p_invoice or (p_customer is not null and r.invoice_id in
      (select i.id from public.invoices i where i.business_id=p_business and i.customer_id=p_customer)))
    order by r.id for update
  loop
    update public.reminders set state='draft',approval_basis=null,reviewed_by=null,reviewed_at=null,
      approved_version=null,approved_body=null,approved_recipient=null,rejection_reason=null,
      version=version+1,updated_at=now() where id=v_old.id returning to_jsonb(reminders.*) into v_after;
    insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
      values(p_business,p_actor,'reminder',v_old.id,jsonb_build_object('before',to_jsonb(v_old),'after',v_after,'invoiceId',v_old.invoice_id),
        'Invoice balance or customer details changed; reminder approval invalidated.');
  end loop;
end $$;

revoke all on function private.reminder_basis(uuid,uuid), private.reminder_command(jsonb),
  private.checked_approved_reminder_text(uuid), private.invalidate_reminders(uuid,uuid,uuid,uuid),
  public.workspace_command(jsonb), public.get_approved_reminder_text(uuid) from public,anon,authenticated;
grant execute on function private.reminder_command(jsonb),private.checked_approved_reminder_text(uuid),
  public.workspace_command(jsonb),public.get_approved_reminder_text(uuid) to authenticated;
