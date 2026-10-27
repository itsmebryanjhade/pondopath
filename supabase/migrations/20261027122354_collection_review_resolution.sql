-- Collection updates run inside the existing business-locked, idempotent command transaction.
create or replace function private.collection_command(p_business public.businesses,p_member public.memberships,p_type text,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_invoice public.invoices; v_old public.expectations; v_task public.followups; v_prior_task public.followups;
  v_invoice_id uuid; v_expectation_id uuid; v_assignee uuid; v_id uuid; v_next_id uuid; v_amount bigint; v_paid numeric; v_unpaid bigint;
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
    end if;
    for v_task in select f.* from public.followups f where f.business_id=p_business.id and f.invoice_id=v_invoice_id
      and f.state='open' and ((f.expectation_id=v_old.id and f.automatic_type in ('missed_commitment','stale_expectation')) or f.automatic_type='correction_review') order by f.id for update
    loop
      update public.followups set state='completed',completion_source='human',resolved_by_movement_id=null,
        completed_at=now(),outcome='Resolved by a reviewed replacement receipt plan.',version=version+1,updated_at=now()
        where id=v_task.id returning to_jsonb(followups.*) into v_related;
      insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
        values(p_business.id,p_member.user_id,'followup',v_task.id,jsonb_build_object('before',to_jsonb(v_task),'after',v_related,'invoiceId',v_invoice_id),'Previous receipt plan superseded.');
    end loop;
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
      select id into v_expectation_id from public.expectations where business_id=p_business.id and invoice_id=v_invoice.id and state in ('active','needs_review');
      insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action)
        values(p_business.id,v_invoice.id,v_expectation_id,v_assignee,v_next_date,v_action)
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
