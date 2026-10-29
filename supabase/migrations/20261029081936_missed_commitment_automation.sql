alter table public.automation_runs
  add column source text not null default 'scheduled' check (source in ('scheduled','manual')),
  add column candidate_ids uuid[] not null default '{}',
  add column pending_ids uuid[] not null default '{}';
create index automation_runs_recent_idx on public.automation_runs (business_id, source, started_at desc);

-- The business lock is shared with financial commands, so create rechecks committed state.
create function private.automation_followups(p_business_id uuid, p_request jsonb, p_source text default 'scheduled', p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  operation text := p_request->>'operation'; ref date; run public.automation_runs;
  candidates jsonb; ids uuid[]; requested uuid[]; expectation public.expectations;
  task_id uuid; task_after jsonb; assignee uuid; inserted integer;
  created integer := 0; existing integer := 0; skipped integer := 0; success boolean; failure text;
begin
  if p_source not in ('scheduled','manual') then raise exception 'VALIDATION_ERROR'; end if;
  perform 1 from public.businesses where id=p_business_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  ref := private.reference_date(p_business_id);
  if operation='scan' then
    perform private.assert_command_keys(p_request,array['operation']);
    update public.automation_runs set status='failed',finished_at=now(),error_code='INTERRUPTED'
      where business_id=p_business_id and source=p_source and status='running' and started_at<now()-interval '30 minutes';
    insert into public.automation_runs(business_id,run_id,status,source)
      values(p_business_id,gen_random_uuid(),'running',p_source) returning * into run;
    select coalesce(jsonb_agg(jsonb_build_object('expectationId',e.id,'remainingCents',e.remaining_cents,'date',e.expected_date) order by e.id),'[]'::jsonb),
      coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into candidates,ids
      from public.expectations e where e.business_id=p_business_id and e.kind='commitment'
        and e.state='active' and e.expected_date<ref and e.remaining_cents>0;
    if cardinality(ids)>1000 then
      update public.automation_runs set status='failed',finished_at=now(),error_code='LIMIT_REACHED'
        where business_id=p_business_id and run_id=run.run_id;
      return jsonb_build_object('errorCode','LIMIT_REACHED');
    end if;
    update public.automation_runs set candidate_ids=ids,pending_ids=ids where business_id=p_business_id and run_id=run.run_id;
    return jsonb_build_object('runId',run.run_id,'referenceDate',ref,'candidates',candidates);
  end if;

  select * into run from public.automation_runs
    where business_id=p_business_id and run_id=private.command_uuid(p_request,'runId') and source=p_source for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if operation='create' then
    perform private.assert_command_keys(p_request,array['operation','runId','expectationIds']);
    if run.status<>'running' or jsonb_typeof(p_request->'expectationIds')<>'array' or
      jsonb_array_length(p_request->'expectationIds')>1000 then raise exception 'VALIDATION_ERROR'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into requested from jsonb_array_elements_text(p_request->'expectationIds');
    if array_position(requested,null) is not null or not (requested<@run.candidate_ids) then raise exception 'VALIDATION_ERROR'; end if;
    for expectation in select e.* from public.expectations e where e.id=any(requested) and e.business_id=p_business_id order by e.id for update
    loop
      if expectation.kind<>'commitment' or expectation.state<>'active' or expectation.expected_date>=ref or expectation.remaining_cents=0 then
        skipped := skipped+1; continue;
      end if;
      select f.assignee_id into assignee from public.followups f join public.memberships m on m.business_id=f.business_id and m.user_id=f.assignee_id
        where f.business_id=p_business_id and f.invoice_id=expectation.invoice_id and f.state='open' order by f.due_date,f.id limit 1;
      if assignee is null then
        select m.user_id into assignee from public.memberships m where m.business_id=p_business_id
          order by (m.user_id=expectation.confirmed_by) desc,(m.role='owner') desc,m.user_id limit 1;
      end if;
      if assignee is null then raise exception 'NOT_FOUND'; end if;
      insert into public.followups(business_id,invoice_id,expectation_id,assignee_id,due_date,next_action,automatic_type)
        values(p_business_id,expectation.invoice_id,expectation.id,assignee,ref,'Check the receipt and follow up on the missed customer payment commitment.','missed_commitment')
        on conflict (expectation_id,automatic_type) do nothing returning id,to_jsonb(followups.*) into task_id,task_after;
      get diagnostics inserted = row_count;
      if inserted=1 then
        created := created+1;
        insert into public.audit_events(business_id,actor_id,entity_kind,entity_id,change,reason)
          values(p_business_id,p_actor_id,'followup',task_id,jsonb_build_object('before',null,'after',task_after,'invoiceId',expectation.invoice_id),
            case when p_source='manual' then 'Manual missed-commitment check.' else 'Scheduled missed-commitment check.' end);
      else existing := existing+1;
      end if;
    end loop;
    -- A deleted candidate is no longer actionable, but still counts as checked.
    skipped := cardinality(requested)-created-existing;
    update public.automation_runs set pending_ids=array(select value from unnest(pending_ids) value where not(value=any(requested)))
      where business_id=p_business_id and run_id=run.run_id;
    if created>0 then update public.businesses set revision=revision+1 where id=p_business_id; end if;
    return jsonb_build_object('created',created,'existing',existing,'skipped',skipped);
  elsif operation='finish' then
    perform private.assert_command_keys(p_request,array['operation','runId','success'],array['errorCode']);
    if jsonb_typeof(p_request->'success')<>'boolean' then raise exception 'VALIDATION_ERROR'; end if;
    success := (p_request->>'success')::boolean;
    failure := p_request->>'errorCode';
    if (success and failure is not null) or (not success and (failure is null or failure not in ('HTTP_ERROR','CONNECTION_ERROR','WORKFLOW_ERROR','INTERRUPTED'))) then raise exception 'VALIDATION_ERROR'; end if;
    if run.status<>'running' then
      if run.status=(case when success then 'success' else 'failed' end) and run.error_code is not distinct from failure then return jsonb_build_object('completed',true); end if;
      raise exception 'VALIDATION_ERROR';
    end if;
    if success and cardinality(run.pending_ids)>0 then raise exception 'VALIDATION_ERROR'; end if;
    update public.automation_runs set status=case when success then 'success' else 'failed' end,finished_at=now(),error_code=failure
      where business_id=p_business_id and run_id=run.run_id;
    return jsonb_build_object('completed',true);
  end if;
  raise exception 'VALIDATION_ERROR';
end $$;

create function public.automation_followups(p_business_id uuid,p_request jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.automation_followups(p_business_id,p_request)
$$;
revoke all on function private.automation_followups(uuid,jsonb,text,uuid), public.automation_followups(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.automation_followups(uuid,jsonb,text,uuid), public.automation_followups(uuid,jsonb) to service_role;

create function public.check_missed_commitments() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership(); scan jsonb; counts jsonb; ids jsonb;
begin
  scan := private.automation_followups(member.business_id,'{"operation":"scan"}'::jsonb,'manual',member.user_id);
  if scan ? 'errorCode' then return scan; end if;
  select coalesce(jsonb_agg(value->>'expectationId'),'[]'::jsonb) into ids from jsonb_array_elements(scan->'candidates');
  counts := private.automation_followups(member.business_id,jsonb_build_object('operation','create','runId',scan->>'runId','expectationIds',ids),'manual',member.user_id);
  perform private.automation_followups(member.business_id,jsonb_build_object('operation','finish','runId',scan->>'runId','success',true),'manual',member.user_id);
  return counts;
end $$;
revoke all on function public.check_missed_commitments() from public,anon,authenticated;
grant execute on function public.check_missed_commitments() to authenticated;

create function private.automation_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership(); last_success timestamptz; latest public.automation_runs; last_manual timestamptz;
begin
  select max(finished_at) into last_success from public.automation_runs where business_id=member.business_id and source='scheduled' and status='success';
  select * into latest from public.automation_runs where business_id=member.business_id and source='scheduled' order by started_at desc,run_id desc limit 1;
  select max(finished_at) into last_manual from public.automation_runs where business_id=member.business_id and source='manual' and status='success';
  return jsonb_build_object('lastSuccessAt',last_success,'stale',last_success is null or last_success<now()-interval '30 minutes',
    'lastAttemptAt',latest.started_at,'lastStatus',latest.status,'lastErrorCode',latest.error_code,'lastManualAt',last_manual);
end $$;
revoke all on function private.automation_status() from public,anon,authenticated;
grant execute on function private.automation_status() to authenticated;
create or replace function public.workspace_snapshot() returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.workspace_snapshot() || jsonb_build_object('automation',private.automation_status())
$$;
