-- A voided reference remains reserved so a replacement cannot masquerade as the old entry.
drop index public.cash_movements_reference_idx;
create unique index cash_movements_reference_idx on public.cash_movements (business_id,lower(btrim(reference)))
  where reference is not null;

create function private.invalidate_reminders(p_business uuid,p_actor uuid,p_invoice uuid,p_customer uuid)
returns void language plpgsql set search_path='' as $$
declare v_old public.reminders; v_after jsonb;
begin
  if (p_invoice is null) = (p_customer is null) then raise exception 'VALIDATION_ERROR'; end if;
  for v_old in select r.* from public.reminders r where r.business_id=p_business and r.state in ('awaiting_review','approved')
    and (r.invoice_id=p_invoice or (p_customer is not null and r.invoice_id in
      (select i.id from public.invoices i where i.business_id=p_business and i.customer_id=p_customer)))
    order by r.id for update
  loop
    update public.reminders set state='draft',approval_basis=null,reviewed_by=null,reviewed_at=null,
      rejection_reason=null,version=version+1,updated_at=now() where id=v_old.id returning to_jsonb(reminders.*) into v_after;
    insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
      values(p_business,p_actor,'reminder',v_old.id,jsonb_build_object('before',to_jsonb(v_old),'after',v_after,'invoiceId',v_old.invoice_id),
        'Invoice balance or customer details changed; reminder approval invalidated.');
  end loop;
end $$;

-- Internal handlers run only inside the dispatcher after its business and membership locks.
create function private.post_cash_movement(p_business public.businesses,p_member public.memberships,p_payload jsonb,p_request uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_kind text; v_parent uuid; v_amount bigint; v_date date; v_reference text;
  v_reviewed boolean:=false; v_review_reason text; v_duplicate boolean; v_id uuid:=gen_random_uuid();
  v_invoice public.invoices; v_expense public.expenses; v_expectation public.expectations; v_task public.followups;
  v_paid numeric; v_unpaid bigint; v_remaining bigint; v_before jsonb; v_after jsonb; v_related jsonb;
  v_resolved jsonb:='[]'::jsonb; v_prior_void jsonb; v_effects jsonb;
begin
  perform private.assert_command_keys(p_payload,array['kind','parentId','amountCents','date','reference'],array['duplicateReviewed','duplicateReviewReason']);
  v_kind:=private.command_text(p_payload,'kind',20);
  v_parent:=private.command_uuid(p_payload,'parentId');
  v_amount:=private.command_integer(p_payload,'amountCents',1,99999999999);
  v_date:=private.command_date(p_payload,'date');
  v_reference:=lower(private.command_text(p_payload,'reference',100,true));
  v_review_reason:=private.command_text(p_payload,'duplicateReviewReason',4000,true);
  if p_payload ? 'duplicateReviewed' then
    if jsonb_typeof(p_payload->'duplicateReviewed') is distinct from 'boolean' then raise exception 'VALIDATION_ERROR'; end if;
    v_reviewed:=(p_payload->>'duplicateReviewed')::boolean;
  end if;
  if v_reviewed <> (v_review_reason is not null) or
     (p_payload ? 'duplicateReviewReason' and v_review_reason is null) then raise exception 'VALIDATION_ERROR'; end if;
  if v_kind not in ('receipt','expense_payment') or v_date < p_business.opening_date or
     v_date > private.reference_date(p_business.id) then raise exception 'VALIDATION_ERROR'; end if;

  if v_kind='receipt' then
    select * into v_invoice from public.invoices where id=v_parent and business_id=p_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into v_paid from public.cash_movements
      where business_id=p_business.id and invoice_id=v_parent and voided_at is null;
    v_unpaid:=v_invoice.amount_cents-v_paid;
    v_before:=to_jsonb(v_invoice)||jsonb_build_object('paid_cents',v_paid,'outstanding_cents',v_unpaid);
  else
    select * into v_expense from public.expenses where id=v_parent and business_id=p_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into v_paid from public.cash_movements
      where business_id=p_business.id and expense_id=v_parent and voided_at is null;
    v_unpaid:=v_expense.amount_cents-v_paid;
    v_before:=to_jsonb(v_expense)||jsonb_build_object('paid_cents',v_paid,'unpaid_cents',v_unpaid);
  end if;
  if v_amount > v_unpaid then raise exception 'VALIDATION_ERROR'; end if;
  if v_reference is not null and exists(select 1 from public.cash_movements
    where business_id=p_business.id and lower(btrim(reference))=v_reference) then raise exception 'DUPLICATE_REFERENCE'; end if;
  select exists(select 1 from public.cash_movements where business_id=p_business.id and kind=v_kind
    and (invoice_id=v_parent or expense_id=v_parent) and payment_date=v_date and amount_cents=v_amount and voided_at is null)
    into v_duplicate;
  if v_duplicate and not v_reviewed then raise exception 'POSSIBLE_DUPLICATE'; end if;
  select jsonb_build_object('id',m.id,'reference',m.reference,'reason',m.void_reason) into v_prior_void
    from public.cash_movements m where m.business_id=p_business.id and (m.invoice_id=v_parent or m.expense_id=v_parent)
    and m.voided_at is not null order by m.voided_at desc,m.id desc limit 1;

  insert into public.cash_movements(id,business_id,kind,invoice_id,expense_id,amount_cents,payment_date,reference,request_id,recorded_by)
    values(v_id,p_business.id,v_kind,case when v_kind='receipt' then v_parent else null end,
      case when v_kind='expense_payment' then v_parent else null end,v_amount,v_date,v_reference,p_request,p_member.user_id);
  v_unpaid:=v_unpaid-v_amount;
  if v_kind='receipt' then
    select * into v_expectation from public.expectations where business_id=p_business.id and invoice_id=v_parent
      and state in ('active','needs_review') for update;
    if found then
      v_remaining:=greatest(0,least(v_expectation.remaining_cents-v_amount,v_unpaid));
      update public.expectations set remaining_cents=v_remaining,
        state=case when v_remaining=0 then 'fulfilled' when state='needs_review' or expected_date<private.reference_date(p_business.id)
          then 'needs_review' else 'active' end,version=version+1
        where id=v_expectation.id returning to_jsonb(expectations.*) into v_related;
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
        values(p_business.id,p_member.user_id,'expectation',v_expectation.id,
          jsonb_build_object('before',to_jsonb(v_expectation),'after',v_related,'invoiceId',v_parent,'movementId',v_id));
    end if;
    for v_task in select f.* from public.followups f where f.business_id=p_business.id and f.invoice_id=v_parent
      and f.state='open' and f.automatic_type in ('missed_commitment','stale_expectation')
      and (v_unpaid=0 or (f.expectation_id=v_expectation.id and v_remaining=0)) order by f.id for update
    loop
      update public.followups set state='completed',completion_source='cash_movement',resolved_by_movement_id=v_id,
        completed_at=now(),outcome='Automatically resolved by a verified receipt.',version=version+1,updated_at=now()
        where id=v_task.id returning to_jsonb(followups.*) into v_related;
      v_resolved:=v_resolved||jsonb_build_array(v_task.id);
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
        values(p_business.id,p_member.user_id,'followup',v_task.id,
          jsonb_build_object('before',to_jsonb(v_task),'after',v_related,'invoiceId',v_parent,'movementId',v_id));
    end loop;
    update public.invoices set version=version+1,updated_at=now() where id=v_parent and business_id=p_business.id
      returning to_jsonb(invoices.*)||jsonb_build_object('paid_cents',v_paid+v_amount,'outstanding_cents',v_unpaid) into v_after;
    perform private.invalidate_reminders(p_business.id,p_member.user_id,v_parent,null);
  else
    update public.expenses set version=version+1,updated_at=now() where id=v_parent and business_id=p_business.id
      returning to_jsonb(expenses.*)||jsonb_build_object('paid_cents',v_paid+v_amount,'unpaid_cents',v_unpaid) into v_after;
  end if;
  v_effects:=jsonb_build_object('expectationBefore',case when v_expectation.id is null then null else to_jsonb(v_expectation) end,
    'autoResolvedFollowupIds',v_resolved,'priorVoid',v_prior_void,'duplicateReviewReason',v_review_reason);
  update public.cash_movements set effects=v_effects where id=v_id returning to_jsonb(cash_movements.*) into v_related;
  update public.businesses set opening_locked_at=coalesce(opening_locked_at,now()) where id=p_business.id;
  insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
    values(p_business.id,p_member.user_id,case when v_kind='receipt' then 'invoice' else 'expense' end,v_parent,
      jsonb_build_object('before',v_before,'after',v_after,'movementId',v_id,'effects',v_effects));
  return jsonb_build_object('recordId',v_id,'after',v_related);
end $$;

create function private.void_cash_movement(p_business public.businesses,p_member public.memberships,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_id uuid; v_reason text; v_old public.cash_movements; v_after jsonb; v_related jsonb;
  v_invoice public.invoices; v_expense public.expenses; v_expectation public.expectations; v_task public.followups;
  v_paid numeric; v_unpaid bigint; v_before_parent jsonb; v_after_parent jsonb; v_tasks jsonb:='[]'::jsonb;
begin
  perform private.assert_command_keys(p_payload,array['movementId','reason']);
  if p_member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  v_id:=private.command_uuid(p_payload,'movementId');
  v_reason:=private.command_text(p_payload,'reason',4000);
  select * into v_old from public.cash_movements where id=v_id and business_id=p_business.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old.voided_at is not null then return jsonb_build_object('recordId',v_id,'alreadyVoided',true); end if;

  if v_old.kind='receipt' then
    select * into strict v_invoice from public.invoices where id=v_old.invoice_id and business_id=p_business.id for update;
    select coalesce(sum(amount_cents),0) into v_paid from public.cash_movements
      where business_id=p_business.id and invoice_id=v_invoice.id and voided_at is null;
    v_before_parent:=to_jsonb(v_invoice)||jsonb_build_object('paid_cents',v_paid,'outstanding_cents',v_invoice.amount_cents-v_paid);
    v_unpaid:=v_invoice.amount_cents-v_paid+v_old.amount_cents;
  else
    select * into strict v_expense from public.expenses where id=v_old.expense_id and business_id=p_business.id for update;
    select coalesce(sum(amount_cents),0) into v_paid from public.cash_movements
      where business_id=p_business.id and expense_id=v_expense.id and voided_at is null;
    v_before_parent:=to_jsonb(v_expense)||jsonb_build_object('paid_cents',v_paid,'unpaid_cents',v_expense.amount_cents-v_paid);
    v_unpaid:=v_expense.amount_cents-v_paid+v_old.amount_cents;
  end if;
  update public.cash_movements set voided_at=now(),voided_by=p_member.user_id,void_reason=v_reason
    where id=v_id returning to_jsonb(cash_movements.*) into v_after;

  if v_old.kind='receipt' then
    select * into v_expectation from public.expectations where business_id=p_business.id and invoice_id=v_invoice.id
      and state in ('active','needs_review') for update;
    if not found then
      select * into v_expectation from public.expectations where business_id=p_business.id and invoice_id=v_invoice.id
        order by confirmed_at desc,id desc limit 1 for update;
    end if;
    -- Preserve the latest statement and remaining amount; a void is not a renewed promise.
    if v_expectation.id is not null and v_expectation.state<>'superseded' then
      update public.expectations set state='needs_review',remaining_cents=least(remaining_cents,v_unpaid),version=version+1
        where id=v_expectation.id returning to_jsonb(expectations.*) into v_related;
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
        values(p_business.id,p_member.user_id,'expectation',v_expectation.id,
          jsonb_build_object('before',to_jsonb(v_expectation),'after',v_related,'invoiceId',v_invoice.id,'movementId',v_id),v_reason);
    end if;

    for v_task in select f.* from public.followups f where f.business_id=p_business.id and f.invoice_id=v_invoice.id
      and f.state='completed' and f.completion_source='cash_movement' and f.resolved_by_movement_id=v_id order by f.id for update
    loop
      update public.followups set state='open',completion_source=null,resolved_by_movement_id=null,completed_at=null,
        outcome=v_reason,version=version+1,updated_at=now() where id=v_task.id returning to_jsonb(followups.*) into v_related;
      v_tasks:=v_tasks||jsonb_build_array(v_task.id);
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
        values(p_business.id,p_member.user_id,'followup',v_task.id,
          jsonb_build_object('before',to_jsonb(v_task),'after',v_related,'invoiceId',v_invoice.id,'movementId',v_id),v_reason);
    end loop;
    if jsonb_array_length(v_tasks)=0 then
      select * into v_task from public.followups where business_id=p_business.id and invoice_id=v_invoice.id and state='open'
        order by due_date,id limit 1 for update;
      if found then
        update public.followups set outcome=v_reason,correction_movement_id=coalesce(correction_movement_id,v_id),
          version=version+1,updated_at=now() where id=v_task.id returning to_jsonb(followups.*) into v_related;
        insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
          values(p_business.id,p_member.user_id,'followup',v_task.id,
            jsonb_build_object('before',to_jsonb(v_task),'after',v_related,'invoiceId',v_invoice.id,'movementId',v_id),v_reason);
      else
        insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action,outcome,automatic_type,correction_movement_id)
          values(p_business.id,v_invoice.id,case when v_expectation.state='needs_review' then v_expectation.id else null end,
            p_member.user_id,private.reference_date(p_business.id),
            'Review the corrected receipt, confirm the remaining cash plan, and follow up if needed.',v_reason,'correction_review',v_id)
          returning * into v_task;
        insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
          values(p_business.id,p_member.user_id,'followup',v_task.id,
            jsonb_build_object('before',null,'after',to_jsonb(v_task),'invoiceId',v_invoice.id,'movementId',v_id),v_reason);
      end if;
      v_tasks:=jsonb_build_array(v_task.id);
    end if;
    update public.invoices set version=version+1,updated_at=now() where id=v_invoice.id and business_id=p_business.id
      returning to_jsonb(invoices.*)||jsonb_build_object('paid_cents',v_paid-v_old.amount_cents,'outstanding_cents',v_unpaid) into v_after_parent;
    perform private.invalidate_reminders(p_business.id,p_member.user_id,v_invoice.id,null);
  else
    update public.expenses set version=version+1,updated_at=now() where id=v_expense.id and business_id=p_business.id
      returning to_jsonb(expenses.*)||jsonb_build_object('paid_cents',v_paid-v_old.amount_cents,'unpaid_cents',v_unpaid) into v_after_parent;
  end if;
  insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
    values(p_business.id,p_member.user_id,case when v_old.kind='receipt' then 'invoice' else 'expense' end,
      coalesce(v_old.invoice_id,v_old.expense_id),
      jsonb_build_object('before',v_before_parent,'after',v_after_parent,'movementId',v_id,'correctionFollowupIds',v_tasks),v_reason);
  return jsonb_build_object('recordId',v_id,'before',to_jsonb(v_old),'after',v_after,'alreadyVoided',false);
end $$;

revoke all on function private.invalidate_reminders(uuid,uuid,uuid,uuid),
  private.post_cash_movement(public.businesses,public.memberships,jsonb,uuid),
  private.void_cash_movement(public.businesses,public.memberships,jsonb) from public,anon,authenticated;

create or replace function private.workspace_command(p_command jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  business public.businesses;
  receipt public.command_receipts;
  old_customer public.customers;
  old_invoice public.invoices;
  old_expense public.expenses;
  old_expectation public.expectations;
  v_request_id uuid;
  expected_revision bigint;
  command_type text;
  payload jsonb;
  payload_digest text;
  record_id uuid;
  v_customer_id uuid;
  entity_kind text;
  before_record jsonb;
  after_record jsonb;
  related_after jsonb;
  result jsonb;
  amount bigint;
  record_date date;
  name_value text;
  contact_value text;
  email_value text;
  phone_value text;
  number_value text;
  payee_value text;
  correction_reason text;
  has_posting boolean;
  paid numeric;
begin
  perform private.assert_command_keys(p_command,array['requestId','expectedRevision','type','payload']);
  v_request_id := private.command_uuid(p_command,'requestId');
  expected_revision := private.command_integer(p_command,'expectedRevision',0,9007199254740991);
  command_type := private.command_text(p_command,'type',64);
  payload := p_command->'payload';
  if command_type not in ('set_opening_cash','save_customer','save_invoice','save_expense','post_cash_movement','void_cash_movement') then
    raise exception 'VALIDATION_ERROR';
  end if;

  select * into business from public.businesses where id = member.business_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  -- Recheck after the business lock and hold membership against concurrent revocation.
  select * into member from public.memberships
    where business_id = business.id and user_id = auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;

  payload_digest := encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into receipt from public.command_receipts c
    where c.business_id = business.id and c.request_id = v_request_id;
  if found then
    if receipt.payload_digest <> payload_digest then raise exception 'REQUEST_ID_REUSE'; end if;
    return receipt.result || jsonb_build_object('replayed',true);
  end if;
  if business.revision <> expected_revision then raise exception 'STALE_VERSION'; end if;
  if business.revision >= 9007199254740991 then raise exception 'LIMIT_REACHED'; end if;

  case command_type
  when 'set_opening_cash' then
    perform private.assert_command_keys(payload,array['amountCents','date']);
    if member.role <> 'owner' then raise exception 'FORBIDDEN'; end if;
    amount := private.command_integer(payload,'amountCents',0,99999999999);
    record_date := private.command_date(payload,'date');
    if record_date > private.reference_date(business.id) or business.opening_locked_at is not null or
       exists (select 1 from public.cash_movements where business_id = business.id) then
      raise exception 'VALIDATION_ERROR';
    end if;
    record_id := business.id;
    entity_kind := 'business';
    before_record := to_jsonb(business);
    update public.businesses set opening_cash_cents = amount, opening_date = record_date
      where id = business.id returning to_jsonb(businesses.*) into after_record;

  when 'save_customer' then
    perform private.assert_command_keys(payload,array['name','contactName'],array['id','email','phone']);
    record_id := private.command_uuid(payload,'id',true);
    name_value := private.command_text(payload,'name',200);
    contact_value := private.command_text(payload,'contactName',200);
    email_value := private.command_text(payload,'email',254,true);
    phone_value := private.command_text(payload,'phone',50,true);
    if email_value is not null and email_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'VALIDATION_ERROR';
    end if;
    entity_kind := 'customer';
    if record_id is not null then
      select * into old_customer from public.customers where id = record_id and business_id = business.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      before_record := to_jsonb(old_customer);
      update public.customers set name = name_value, contact_name = contact_value, email = email_value,
        phone = phone_value, version = version + 1, updated_at = now()
        where id = record_id and business_id = business.id returning to_jsonb(customers.*) into after_record;
    else
      insert into public.customers (business_id,name,contact_name,email,phone)
        values (business.id,name_value,contact_value,email_value,phone_value)
        returning id,to_jsonb(customers.*) into record_id,after_record;
    end if;

  when 'save_invoice' then
    perform private.assert_command_keys(payload,array['number','customerId','amountCents','dueDate'],array['id','reason']);
    record_id := private.command_uuid(payload,'id',true);
    v_customer_id := private.command_uuid(payload,'customerId');
    number_value := private.command_text(payload,'number',100);
    amount := private.command_integer(payload,'amountCents',1,99999999999);
    record_date := private.command_date(payload,'dueDate');
    correction_reason := private.command_text(payload,'reason',4000,true);
    perform 1 from public.customers where id = v_customer_id and business_id = business.id for key share;
    if not found then raise exception 'NOT_FOUND'; end if;
    entity_kind := 'invoice';
    if record_id is not null then
      select * into old_invoice from public.invoices where id = record_id and business_id = business.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      before_record := to_jsonb(old_invoice);
      select exists (select 1 from public.cash_movements where invoice_id = record_id and business_id = business.id) into has_posting;
      select coalesce(sum(amount_cents),0) into paid from public.cash_movements
        where invoice_id = record_id and business_id = business.id and voided_at is null;
      if amount < paid then raise exception 'VALIDATION_ERROR'; end if;
      if has_posting then
        if v_customer_id <> old_invoice.customer_id or number_value <> old_invoice.number then raise exception 'VALIDATION_ERROR'; end if;
        if amount <> old_invoice.amount_cents or record_date <> old_invoice.due_date then
          if member.role <> 'owner' then raise exception 'FORBIDDEN'; end if;
          if correction_reason is null then raise exception 'VALIDATION_ERROR'; end if;
        end if;
      end if;
      update public.invoices set number = number_value, customer_id = v_customer_id,
        amount_cents = amount, due_date = record_date, version = version + 1, updated_at = now()
        where id = record_id and business_id = business.id returning to_jsonb(invoices.*) into after_record;
      select * into old_expectation from public.expectations
        where invoice_id = record_id and business_id = business.id and state in ('active','needs_review') for update;
      if found then
        update public.expectations set remaining_cents = least(remaining_cents,amount - paid),
          state = case when amount = paid then 'fulfilled' else 'needs_review' end, version = version + 1
          where id = old_expectation.id returning to_jsonb(expectations.*) into related_after;
        insert into public.audit_events (business_id,actor_id,entity_kind,entity_id,change,reason)
          values (business.id,member.user_id,'expectation',old_expectation.id,
            jsonb_build_object('before',to_jsonb(old_expectation),'after',related_after,'invoiceId',record_id),
            'Invoice details changed; expected receipt requires review.');
      end if;
    else
      if (select count(*) from public.invoices where business_id = business.id) >= 1000 then raise exception 'LIMIT_REACHED'; end if;
      insert into public.invoices (business_id,customer_id,number,amount_cents,due_date)
        values (business.id,v_customer_id,number_value,amount,record_date)
        returning id,to_jsonb(invoices.*) into record_id,after_record;
      insert into public.expectations (business_id,invoice_id,amount_cents,remaining_cents,expected_date,kind,source_note,confirmed_by)
        values (business.id,record_id,amount,amount,record_date,'assumption',
          'Assumed payment on the invoice due date; not a customer commitment.',member.user_id)
        returning * into old_expectation;
      insert into public.audit_events (business_id,actor_id,entity_kind,entity_id,change)
        values (business.id,member.user_id,'expectation',old_expectation.id,
          jsonb_build_object('before',null,'after',to_jsonb(old_expectation),'invoiceId',record_id));
    end if;

  when 'save_expense' then
    perform private.assert_command_keys(payload,array['label','payee','amountCents','dueDate'],array['id','reason']);
    record_id := private.command_uuid(payload,'id',true);
    name_value := private.command_text(payload,'label',200);
    payee_value := private.command_text(payload,'payee',200);
    amount := private.command_integer(payload,'amountCents',1,99999999999);
    record_date := private.command_date(payload,'dueDate');
    correction_reason := private.command_text(payload,'reason',4000,true);
    entity_kind := 'expense';
    if record_id is not null then
      select * into old_expense from public.expenses where id = record_id and business_id = business.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      before_record := to_jsonb(old_expense);
      select exists (select 1 from public.cash_movements where expense_id = record_id and business_id = business.id) into has_posting;
      select coalesce(sum(amount_cents),0) into paid from public.cash_movements
        where expense_id = record_id and business_id = business.id and voided_at is null;
      if amount < paid then raise exception 'VALIDATION_ERROR'; end if;
      if has_posting then
        if name_value <> old_expense.label or payee_value <> old_expense.payee then raise exception 'VALIDATION_ERROR'; end if;
        if amount <> old_expense.amount_cents or record_date <> old_expense.due_date then
          if member.role <> 'owner' then raise exception 'FORBIDDEN'; end if;
          if correction_reason is null then raise exception 'VALIDATION_ERROR'; end if;
        end if;
      end if;
      update public.expenses set label = name_value, payee = payee_value, amount_cents = amount,
        due_date = record_date, version = version + 1, updated_at = now()
        where id = record_id and business_id = business.id returning to_jsonb(expenses.*) into after_record;
    else
      if (select count(*) from public.expenses where business_id = business.id) >= 1000 then raise exception 'LIMIT_REACHED'; end if;
      insert into public.expenses (business_id,label,payee,amount_cents,due_date)
        values (business.id,name_value,payee_value,amount,record_date)
        returning id,to_jsonb(expenses.*) into record_id,after_record;
    end if;
  when 'post_cash_movement' then
    result := private.post_cash_movement(business,member,payload,v_request_id);
    record_id := (result->>'recordId')::uuid;
    entity_kind := 'cash_movement';
    after_record := result->'after';
  when 'void_cash_movement' then
    result := private.void_cash_movement(business,member,payload);
    record_id := (result->>'recordId')::uuid;
    if (result->>'alreadyVoided')::boolean then
      result := jsonb_build_object('revision',business.revision,'recordId',record_id,'replayed',true);
      insert into public.command_receipts(business_id,request_id,payload_digest,result)
        values(business.id,v_request_id,payload_digest,result);
      return result;
    end if;
    entity_kind := 'cash_movement';
    before_record := result->'before';
    after_record := result->'after';
    correction_reason := payload->>'reason';
  end case;

  if entity_kind='customer' then
    perform private.invalidate_reminders(business.id,member.user_id,null,record_id);
  elsif entity_kind='invoice' then
    perform private.invalidate_reminders(business.id,member.user_id,record_id,null);
  end if;

  insert into public.audit_events (business_id,actor_id,entity_kind,entity_id,change,reason)
    values (business.id,member.user_id,entity_kind,record_id,
      jsonb_build_object('before',before_record,'after',after_record),correction_reason);
  update public.businesses set revision = revision + 1 where id = business.id returning revision into expected_revision;
  result := jsonb_build_object('revision',expected_revision,'recordId',record_id,'replayed',false);
  insert into public.command_receipts (business_id,request_id,payload_digest,result)
    values (business.id,v_request_id,payload_digest,result);
  return result;
exception
  when unique_violation then raise exception 'DUPLICATE_REFERENCE';
  when foreign_key_violation then raise exception 'NOT_FOUND';
  when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception 'VALIDATION_ERROR';
end $$;
