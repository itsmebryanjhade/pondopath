-- Collection updates run inside the existing business-locked, idempotent command transaction.
create function private.collection_command(p_business public.businesses,p_member public.memberships,p_type text,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_invoice public.invoices; v_old public.expectations; v_task public.followups; v_prior_task public.followups;
  v_invoice_id uuid; v_assignee uuid; v_id uuid; v_next_id uuid; v_amount bigint; v_paid numeric; v_unpaid bigint;
  v_date date; v_next_date date; v_kind text; v_note text; v_action text; v_outcome text;
  v_before jsonb; v_after jsonb; v_related jsonb; v_entity text; v_reason text;
begin
  if p_type='confirm_expectation' then
    perform private.assert_command_keys(p_payload,array['invoiceId','amountCents','date','kind','sourceNote','nextFollowupDate','assigneeId']);
    v_invoice_id:=private.command_uuid(p_payload,'invoiceId');
  elsif p_type='save_followup' then
    perform private.assert_command_keys(p_payload,array['invoiceId','date','nextAction','assigneeId'],array['id']);
    v_invoice_id:=private.command_uuid(p_payload,'invoiceId');
  elsif p_type='complete_followup' then
    perform private.assert_command_keys(p_payload,array['id','outcome','assigneeId'],array['nextAction','nextDate']);
    v_id:=private.command_uuid(p_payload,'id');
    select * into v_task from public.followups where id=v_id and business_id=p_business.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_task.state<>'open' then raise exception 'VALIDATION_ERROR'; end if;
    v_invoice_id:=v_task.invoice_id;
  else raise exception 'VALIDATION_ERROR';
  end if;
  v_assignee:=private.command_uuid(p_payload,'assigneeId');
  perform 1 from public.memberships where business_id=p_business.id and user_id=v_assignee for share;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_invoice from public.invoices where id=v_invoice_id and business_id=p_business.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.cash_movements
    where business_id=p_business.id and invoice_id=v_invoice_id and voided_at is null;
  v_unpaid:=v_invoice.amount_cents-v_paid;

  if p_type='confirm_expectation' then
    v_amount:=private.command_integer(p_payload,'amountCents',1,99999999999);
    v_date:=private.command_date(p_payload,'date');
    v_next_date:=private.command_date(p_payload,'nextFollowupDate');
    v_kind:=private.command_text(p_payload,'kind',20);
    v_note:=private.command_text(p_payload,'sourceNote',4000);
    if v_amount>v_unpaid or v_kind not in ('assumption','commitment') or v_next_date<private.reference_date(p_business.id) then
      raise exception 'VALIDATION_ERROR';
    end if;
    select * into v_old from public.expectations where business_id=p_business.id and invoice_id=v_invoice_id
      and state in ('active','needs_review') for update;
    v_before:=case when v_old.id is null then null else to_jsonb(v_old) end;
    if v_old.id is not null then
      update public.expectations set state='superseded',version=version+1 where id=v_old.id returning to_jsonb(expectations.*) into v_related;
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
        values(p_business.id,p_member.user_id,'expectation',v_old.id,jsonb_build_object('before',to_jsonb(v_old),'after',v_related,'invoiceId',v_invoice_id),'Replaced by a reviewed receipt plan.');
      for v_task in select f.* from public.followups f where f.business_id=p_business.id and f.invoice_id=v_invoice_id
        and f.expectation_id=v_old.id and f.state='open' and f.automatic_type is not null order by f.id for update
      loop
        update public.followups set state='completed',completion_source='human',resolved_by_movement_id=null,
          completed_at=now(),outcome='Resolved by a reviewed replacement receipt plan.',version=version+1,updated_at=now()
          where id=v_task.id returning to_jsonb(followups.*) into v_related;
        insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
          values(p_business.id,p_member.user_id,'followup',v_task.id,jsonb_build_object('before',to_jsonb(v_task),'after',v_related,'invoiceId',v_invoice_id),'Previous receipt plan superseded.');
      end loop;
    end if;
    insert into public.expectations(business_id,invoice_id,amount_cents,remaining_cents,expected_date,kind,state,source_note,confirmed_by)
      values(p_business.id,v_invoice_id,v_amount,v_amount,v_date,v_kind,
        case when v_date<private.reference_date(p_business.id) then 'needs_review' else 'active' end,v_note,p_member.user_id)
      returning id,to_jsonb(expectations.*) into v_id,v_after;
    select * into v_prior_task from public.followups where business_id=p_business.id and invoice_id=v_invoice_id
      and state='open' and automatic_type is null order by due_date,id limit 1 for update;
    if found then
      update public.followups set expectation_id=v_id,assignee_id=v_assignee,due_date=v_next_date,version=version+1,updated_at=now()
        where id=v_prior_task.id returning id,to_jsonb(followups.*) into v_next_id,v_related;
    else
      insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action)
        values(p_business.id,v_invoice_id,v_id,v_assignee,v_next_date,'Verify the expected receipt and follow up with the customer if needed.')
        returning id,to_jsonb(followups.*) into v_next_id,v_related;
    end if;
    insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
      values(p_business.id,p_member.user_id,'followup',v_next_id,jsonb_build_object('before',case when v_prior_task.id is null then null else to_jsonb(v_prior_task) end,'after',v_related,'invoiceId',v_invoice_id));
    perform private.invalidate_reminders(p_business.id,p_member.user_id,v_invoice_id,null);
    v_entity:='expectation'; v_reason:='Reviewed receipt expectation confirmed.';

  elsif p_type='save_followup' then
    if v_unpaid=0 then raise exception 'VALIDATION_ERROR'; end if;
    v_id:=private.command_uuid(p_payload,'id',true);
    v_date:=private.command_date(p_payload,'date');
    v_action:=private.command_text(p_payload,'nextAction',4000);
    if v_id is not null then
      select * into v_task from public.followups where id=v_id and business_id=p_business.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if v_task.invoice_id<>v_invoice_id or v_task.state<>'open' then raise exception 'VALIDATION_ERROR'; end if;
      v_before:=to_jsonb(v_task);
      update public.followups set assignee_id=v_assignee,due_date=v_date,next_action=v_action,version=version+1,updated_at=now()
        where id=v_id returning to_jsonb(followups.*) into v_after;
    else
      select id into v_next_id from public.expectations where business_id=p_business.id and invoice_id=v_invoice_id and state in ('active','needs_review');
      insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action)
        values(p_business.id,v_invoice_id,v_next_id,v_assignee,v_date,v_action)
        returning id,to_jsonb(followups.*) into v_id,v_after;
      v_next_id:=null;
    end if;
    v_entity:='followup';

  else
    v_before:=to_jsonb(v_task);
    v_outcome:=private.command_text(p_payload,'outcome',4000);
    v_action:=private.command_text(p_payload,'nextAction',4000,true);
    if (p_payload ? 'nextAction')<>(p_payload ? 'nextDate') or (p_payload ? 'nextAction' and v_action is null) then raise exception 'VALIDATION_ERROR'; end if;
    if p_payload ? 'nextDate' then v_next_date:=private.command_date(p_payload,'nextDate'); end if;
    if (v_unpaid>0 and v_next_date is null) or (v_unpaid=0 and v_next_date is not null)
      or v_next_date<private.reference_date(p_business.id) then raise exception 'VALIDATION_ERROR'; end if;
    update public.followups set state='completed',completion_source='human',resolved_by_movement_id=null,
      completed_at=now(),outcome=v_outcome,next_date=v_next_date,version=version+1,updated_at=now()
      where id=v_id returning to_jsonb(followups.*) into v_after;
    if v_unpaid>0 then
      select id into v_invoice_id from public.expectations where business_id=p_business.id and invoice_id=v_invoice.id and state in ('active','needs_review');
      insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action)
        values(p_business.id,v_invoice.id,v_invoice_id,v_assignee,v_next_date,v_action)
        returning id,to_jsonb(followups.*) into v_next_id,v_related;
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change)
        values(p_business.id,p_member.user_id,'followup',v_next_id,jsonb_build_object('before',null,'after',v_related,'invoiceId',v_invoice.id,'previousFollowupId',v_id));
    end if;
    v_entity:='followup'; v_reason:=v_outcome;
  end if;
  insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
    values(p_business.id,p_member.user_id,'invoice',v_invoice.id,
      jsonb_build_object('operation',p_type,'before',v_before,'after',v_after,'recordId',v_id,'nextFollowupId',v_next_id),v_reason);
  return jsonb_build_object('recordId',v_id,'entityKind',v_entity,'before',v_before,'after',v_after,'reason',v_reason);
end $$;

revoke all on function private.collection_command(public.businesses,public.memberships,text,jsonb) from public,anon,authenticated;

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
  if command_type not in ('set_opening_cash','save_customer','save_invoice','save_expense','post_cash_movement','void_cash_movement','confirm_expectation','save_followup','complete_followup') then
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
  when 'confirm_expectation','save_followup','complete_followup' then
    result := private.collection_command(business,member,command_type,payload);
    record_id := (result->>'recordId')::uuid;
    entity_kind := result->>'entityKind';
    before_record := result->'before';
    after_record := result->'after';
    correction_reason := result->>'reason';
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
