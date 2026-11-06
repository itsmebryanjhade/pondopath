-- Refresh stored headers when a mapped column goes missing, so the owner can remap without recreating the connection.
create or replace function public.connector_ingest(p_source_id uuid,p_key text,p_run jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_business uuid; source public.intake_sources; existing public.intake_connector_runs; v_run_id text; v_result text;
  results jsonb:='[]'; first_read jsonb; actual_counts jsonb; rejected jsonb;
begin
  if p_source_id is null or p_key is null or length(p_key) not between 32 and 200 then raise exception 'UNAUTHENTICATED'; end if;
  select business_id into v_business from public.intake_sources where id=p_source_id;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  -- Business first, then source: the same lock order as staging and review, so overlapping runs serialize.
  perform 1 from public.businesses where id=v_business for update;
  select * into source from public.intake_sources where id=p_source_id and business_id=v_business for update;
  if source.kind<>'google_sheet' or source.connector_status='disconnected'
    or source.connector_key_hash is distinct from encode(sha256(convert_to(p_key,'UTF8')),'hex') then raise exception 'UNAUTHENTICATED'; end if;
  perform private.assert_command_keys(p_run,array['runId','result','counts'],array['errorCode','firstRead','rows']);
  v_run_id:=btrim(p_run->>'runId');
  v_result:=p_run->>'result';
  if length(coalesce(v_run_id,'')) not between 1 and 200 or v_result not in ('staged','paused','awaiting_mapping','failed','first_read')
    or jsonb_typeof(p_run->'counts')<>'object' or octet_length((p_run->'counts')::text)>65536
    or (p_run ? 'errorCode' and coalesce(p_run->>'errorCode','') !~ '^[A-Z_]{1,64}$') then raise exception 'VALIDATION_ERROR'; end if;
  select * into existing from public.intake_connector_runs where source_id=source.id and run_id=v_run_id;
  if found then return jsonb_build_object('replayed',true,'result',existing.result,'counts',existing.counts,'errorCode',existing.error_code,'results','[]'::jsonb); end if;

  if v_result='first_read' then
    first_read:=p_run->'firstRead';
    if jsonb_typeof(first_read)<>'object' or jsonb_typeof(first_read->'headers')<>'array' or jsonb_array_length(first_read->'headers') not between 1 and 24
      or jsonb_typeof(first_read->'samples')<>'array' or jsonb_array_length(first_read->'samples')>5 or octet_length(first_read::text)>24576 then raise exception 'VALIDATION_ERROR'; end if;
    if source.connector_status in ('awaiting_first_read','awaiting_mapping') then
      update public.intake_sources set connector_settings=connector_settings||jsonb_build_object('headers',first_read->'headers','samples',first_read->'samples'),
        connector_status='awaiting_mapping' where id=source.id;
    end if;
  elsif v_result='failed' and p_run->>'errorCode'='MAPPING_HEADER_MISSING' and p_run ? 'firstRead' then
    -- A mapped column was renamed or removed: keep the Sheet's current headers so the owner can remap.
    -- Status and the saved mapping stay unchanged until the owner saves a new mapping.
    first_read:=p_run->'firstRead';
    if jsonb_typeof(first_read)<>'object' or jsonb_typeof(first_read->'headers')<>'array' or jsonb_array_length(first_read->'headers') not between 1 and 24
      or jsonb_typeof(first_read->'samples')<>'array' or jsonb_array_length(first_read->'samples')>5 or octet_length(first_read::text)>24576 then raise exception 'VALIDATION_ERROR'; end if;
    update public.intake_sources set connector_settings=connector_settings||jsonb_build_object('headers',first_read->'headers','samples',first_read->'samples')
      where id=source.id;
  elsif v_result='staged' then
    if source.connector_status='paused' then v_result:='paused';
    elsif source.connector_status<>'active' then v_result:='awaiting_mapping';
    elsif jsonb_array_length(coalesce(p_run->'rows','[]'::jsonb))>0 then
      -- Rows are staged on behalf of the owner who connected the Sheet, who must still be an owner of this business.
      perform 1 from public.memberships where business_id=source.business_id and user_id=source.created_by and role='owner' for share;
      if not found then raise exception 'FORBIDDEN'; end if;
      results:=private.stage_intake_rows(source.business_id,source.created_by,source.id,p_run->'rows');
    end if;
  end if;

  -- Derive outcomes after staging, while holding the same locks and transaction.
  actual_counts:=p_run->'counts';
  if v_result='staged' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'row',coalesce((input.value->'evidence'->>'sheetRow')::integer,2),
      'reason','This row needs attention. Review current records.')),'[]'::jsonb)
      into rejected
      from jsonb_array_elements(results) outcome
      left join lateral (
        select value from jsonb_array_elements(coalesce(p_run->'rows','[]'::jsonb))
        where value->>'externalId'=outcome->>'externalId' limit 1
      ) input on true
      where outcome->>'status'='error';
    actual_counts:=actual_counts||jsonb_build_object(
      'staged',(select count(*) from jsonb_array_elements(results) item
        where item->>'itemId' is not null and item->>'status'<>'error' and not coalesce((item->>'replayed')::boolean,false)),
      'unchanged',coalesce((actual_counts->>'unchanged')::integer,0)+(select count(*) from jsonb_array_elements(results) item
        where item->>'status'='unchanged' or coalesce((item->>'replayed')::boolean,false)),
      'invalid',coalesce(actual_counts->'invalid','[]'::jsonb)||rejected);
  else
    actual_counts:=actual_counts||jsonb_build_object('staged',0);
  end if;

  insert into public.intake_connector_runs(business_id,source_id,run_id,result,counts,error_code)
    values(source.business_id,source.id,v_run_id,v_result,actual_counts,nullif(p_run->>'errorCode',''));
  update public.intake_sources set last_run_at=now(),
    last_run_summary=jsonb_build_object('result',v_result,'counts',actual_counts,'errorCode',p_run->>'errorCode','at',now())
    where id=source.id;
  delete from public.intake_connector_runs where source_id=source.id and id not in
    (select id from public.intake_connector_runs where source_id=source.id order by received_at desc,id desc limit 200);
  return jsonb_build_object('replayed',false,'result',v_result,'counts',actual_counts,'errorCode',p_run->>'errorCode','results',results);
end $$;
