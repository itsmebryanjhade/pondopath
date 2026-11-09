-- Google Sheet connector: per-source key (hash only), saved mapping, run history and server-only staging.
-- n8n never reaches these tables; the app's server calls connector_source/connector_ingest with the source key.

alter table public.intake_sources
  add column mapping jsonb check (mapping is null or (jsonb_typeof(mapping)='object' and octet_length(mapping::text)<=8192)),
  add column connector_key_hash text check (connector_key_hash is null or connector_key_hash ~ '^[0-9a-f]{64}$'),
  add column connector_status text check (connector_status in ('awaiting_first_read','awaiting_mapping','active','paused','disconnected')),
  add column connector_settings jsonb check (connector_settings is null or (jsonb_typeof(connector_settings)='object' and octet_length(connector_settings::text)<=32768)),
  add column last_run_at timestamptz,
  add column last_run_summary jsonb check (last_run_summary is null or (jsonb_typeof(last_run_summary)='object' and octet_length(last_run_summary::text)<=65536));
alter table public.intake_sources add constraint intake_sources_connector_shape check ((kind='google_sheet')=(connector_status is not null));

-- Members may read connection status but never the key hash.
revoke select on public.intake_sources from authenticated;
grant select (id,business_id,kind,label,created_by,created_at,mapping,connector_status,connector_settings,last_run_at,last_run_summary)
  on public.intake_sources to authenticated;

create table public.intake_connector_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  source_id uuid not null,
  run_id text not null check (length(btrim(run_id)) between 1 and 200),
  received_at timestamptz not null default now(),
  result text not null check (result in ('staged','paused','awaiting_mapping','failed','first_read')),
  counts jsonb not null default '{}' check (jsonb_typeof(counts)='object' and octet_length(counts::text)<=65536),
  error_code text check (error_code is null or error_code ~ '^[A-Z_]{1,64}$'),
  unique (source_id,run_id),
  foreign key (source_id,business_id) references public.intake_sources (id,business_id) on delete cascade
);
create index intake_connector_runs_recent on public.intake_connector_runs (source_id,received_at desc);
alter table public.intake_connector_runs enable row level security;
create policy intake_connector_runs_member_read on public.intake_connector_runs for select to authenticated
  using (business_id in (select business_id from public.memberships where user_id = (select auth.uid())));
revoke all on public.intake_connector_runs from public,anon,authenticated;
grant select on public.intake_connector_runs to authenticated;
grant all on public.intake_connector_runs to service_role;

-- Shared staging core, extracted unchanged from stage_intake so the session and connector paths stay identical.
-- Callers must already hold the business row lock and have verified the actor.
create function private.stage_intake_row(p_business_id uuid,p_actor uuid,p_source_id uuid,p_external_id text,p_source_version text,p_candidate jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources; old_item public.intake_items;
  binding public.intake_items; candidate jsonb:=p_candidate; proposal jsonb; item_id uuid;
begin
  if p_external_id is null or length(btrim(p_external_id)) not between 1 and 200 or
    p_source_version is null or length(btrim(p_source_version)) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  select * into source from public.intake_sources where id=p_source_id and business_id=p_business_id for update;
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
  proposal:=private.intake_proposal(p_business_id,candidate);
  update public.intake_items set status='superseded',review_version=review_version+1
    where source_id=source.id and external_id=btrim(p_external_id) and status in ('pending','needs_match');
  if proposal->>'status'='unchanged' then return null; end if;
  if (select count(*) from public.intake_items where business_id=p_business_id)>=10000 then raise exception 'LIMIT_REACHED'; end if;
  if old_item.status='superseded' then
    update public.intake_items set candidate=proposal->'candidate',current_values=nullif(proposal->'current','null'::jsonb),
      matched_record_id=(proposal->>'recordId')::uuid,matched_version=(proposal->>'recordVersion')::integer,
      status=proposal->>'status',review_version=review_version+1
      where id=old_item.id returning id into item_id;
  else
    insert into public.intake_items(business_id,source_id,external_id,source_version,candidate,original_content,current_values,
      matched_record_id,matched_version,status,staged_by)
      values(p_business_id,source.id,btrim(p_external_id),btrim(p_source_version),proposal->'candidate',p_candidate,
        nullif(proposal->'current','null'::jsonb),(proposal->>'recordId')::uuid,(proposal->>'recordVersion')::integer,proposal->>'status',p_actor)
      returning id into item_id;
  end if;
  return item_id;
end $$;

-- Shared batch core, extracted from stage_intake_batch; per-row failures are reported, not raised.
create function private.stage_intake_rows(p_business_id uuid,p_actor uuid,p_source_id uuid,p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row_data jsonb; result jsonb:='[]'; item_id uuid; existing_id uuid; state text; message text;
begin
  perform 1 from public.intake_sources where id=p_source_id and business_id=p_business_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>524288 then raise exception 'VALIDATION_ERROR'; end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    begin
      perform private.assert_command_keys(row_data,array['externalId','sourceVersion','candidate','evidence']);
      if jsonb_typeof(row_data->'evidence')<>'object' or octet_length((row_data->'evidence')::text)>16384 then raise exception 'VALIDATION_ERROR'; end if;
      if (select count(*) from jsonb_array_elements(p_rows) r where btrim(r->>'externalId')=btrim(row_data->>'externalId'))>1 then raise exception 'VALIDATION_ERROR'; end if;
      select id into existing_id from public.intake_items where source_id=p_source_id and external_id=btrim(row_data->>'externalId') and source_version=btrim(row_data->>'sourceVersion');
      item_id:=private.stage_intake_row(p_business_id,p_actor,p_source_id,row_data->>'externalId',row_data->>'sourceVersion',row_data->'candidate');
      state:='unchanged';
      if item_id is not null then
        if existing_id is null then update public.intake_items set source_evidence=row_data->'evidence' where id=item_id; end if;
        select status into state from public.intake_items where id=item_id;
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('externalId',row_data->>'externalId','itemId',item_id,'status',state,'replayed',existing_id is not null));
    exception when others then
      get stacked diagnostics message=message_text;
      result:=result||jsonb_build_array(jsonb_build_object('externalId',row_data->>'externalId','status','error','code',
        case when message in ('NOT_FOUND','FORBIDDEN','STALE_VERSION','LIMIT_REACHED') then message else 'VALIDATION_ERROR' end));
    end;
  end loop;
  return result;
end $$;

create or replace function public.stage_intake(p_source_id uuid,p_external_id text,p_source_version text,p_candidate jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership();
begin
  perform 1 from public.businesses where id=member.business_id for update;
  select * into member from public.memberships where business_id=member.business_id and user_id=auth.uid() for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  return private.stage_intake_row(member.business_id,member.user_id,p_source_id,p_external_id,p_source_version,p_candidate);
end $$;

create or replace function public.stage_intake_batch(p_source_id uuid,p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership();
begin
  perform 1 from public.businesses where id=member.business_id for update;
  return private.stage_intake_rows(member.business_id,member.user_id,p_source_id,p_rows);
end $$;

create function private.connector_settings_valid(p_settings jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_settings) key where key not in ('spreadsheetId','gid','intervalMinutes')) then return false; end if;
  if coalesce(p_settings->>'spreadsheetId','') !~ '^[A-Za-z0-9_-]{20,100}$' then return false; end if;
  if p_settings ? 'gid' and coalesce(p_settings->>'gid','') !~ '^[0-9]{1,12}$' then return false; end if;
  if coalesce(p_settings->>'intervalMinutes','') !~ '^[0-9]{1,2}$' then return false; end if;
  return (p_settings->>'intervalMinutes')::integer between 5 and 60;
end $$;

-- Owner-only connection management. Keys are generated by the app server; only their SHA-256 hex hash arrives here.
create function public.create_sheet_connection(p_label text,p_settings jsonb,p_key_hash text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); v_id uuid;
begin
  if member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 200 or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or not private.connector_settings_valid(p_settings) then raise exception 'VALIDATION_ERROR'; end if;
  perform 1 from public.businesses where id=member.business_id for update;
  if (select count(*) from public.intake_sources where business_id=member.business_id)>=20 then raise exception 'LIMIT_REACHED'; end if;
  insert into public.intake_sources(business_id,kind,label,created_by,connector_key_hash,connector_status,connector_settings)
    values(member.business_id,'google_sheet',btrim(p_label),member.user_id,p_key_hash,'awaiting_first_read',p_settings) returning id into v_id;
  return v_id;
end $$;

create function private.owned_connector(p_source_id uuid) returns public.intake_sources
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); source public.intake_sources;
begin
  if member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.businesses where id=member.business_id for update;
  select * into source from public.intake_sources where id=p_source_id and business_id=member.business_id and kind='google_sheet' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  return source;
end $$;

create function public.save_connector_mapping(p_source_id uuid,p_mapping jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.connector_status not in ('awaiting_mapping','active','paused') or p_mapping is null or jsonb_typeof(p_mapping)<>'object'
    or coalesce(p_mapping->>'kind','') not in ('invoice','expense','mixed') or octet_length(p_mapping::text)>8192 then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set mapping=p_mapping,
    connector_status=case when connector_status='paused' then 'paused' else 'active' end where id=source.id;
end $$;

create function public.set_connector_paused(p_source_id uuid,p_paused boolean) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.connector_status not in ('active','paused') or p_paused is null then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set connector_status=case when p_paused then 'paused' else 'active' end where id=source.id;
end $$;

create function public.replace_connector_key(p_source_id uuid,p_key_hash text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.connector_status='disconnected' or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set connector_key_hash=p_key_hash where id=source.id;
end $$;

create function public.disconnect_connector(p_source_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  update public.intake_sources set connector_status='disconnected',connector_key_hash=null where id=source.id;
end $$;

-- Server-only (service_role): resolve a source from its key. The business always comes from the source row.
create function public.connector_source(p_source_id uuid,p_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source public.intake_sources;
begin
  if p_source_id is null or p_key is null or length(p_key) not between 32 and 200 then raise exception 'UNAUTHENTICATED'; end if;
  select * into source from public.intake_sources where id=p_source_id and kind='google_sheet' and connector_status<>'disconnected'
    and connector_key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex');
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  return jsonb_build_object('businessId',source.business_id,'status',source.connector_status,'mapping',source.mapping,
    'settings',source.connector_settings,'connectedBy',source.created_by);
end $$;

-- Server-only (service_role): record one n8n read and stage its new/changed rows in the same transaction.
create function public.connector_ingest(p_source_id uuid,p_key text,p_run jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_business uuid; source public.intake_sources; existing public.intake_connector_runs; v_run_id text; v_result text;
  results jsonb:='[]'; first_read jsonb;
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
  if found then return jsonb_build_object('replayed',true,'result',existing.result,'results','[]'::jsonb); end if;

  if v_result='first_read' then
    first_read:=p_run->'firstRead';
    if jsonb_typeof(first_read)<>'object' or jsonb_typeof(first_read->'headers')<>'array' or jsonb_array_length(first_read->'headers') not between 1 and 24
      or jsonb_typeof(first_read->'samples')<>'array' or jsonb_array_length(first_read->'samples')>5 or octet_length(first_read::text)>24576 then raise exception 'VALIDATION_ERROR'; end if;
    if source.connector_status in ('awaiting_first_read','awaiting_mapping') then
      update public.intake_sources set connector_settings=connector_settings||jsonb_build_object('headers',first_read->'headers','samples',first_read->'samples'),
        connector_status='awaiting_mapping' where id=source.id;
    end if;
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

  insert into public.intake_connector_runs(business_id,source_id,run_id,result,counts,error_code)
    values(source.business_id,source.id,v_run_id,v_result,p_run->'counts',nullif(p_run->>'errorCode',''));
  update public.intake_sources set last_run_at=now(),
    last_run_summary=jsonb_build_object('result',v_result,'counts',p_run->'counts','errorCode',p_run->>'errorCode','at',now())
    where id=source.id;
  delete from public.intake_connector_runs where source_id=source.id and id not in
    (select id from public.intake_connector_runs where source_id=source.id order by received_at desc,id desc limit 200);
  return jsonb_build_object('replayed',false,'result',v_result,'results',results);
end $$;

revoke all on function private.stage_intake_row(uuid,uuid,uuid,text,text,jsonb),private.stage_intake_rows(uuid,uuid,uuid,jsonb),
  private.connector_settings_valid(jsonb),private.owned_connector(uuid) from public,anon,authenticated;
revoke all on function public.create_sheet_connection(text,jsonb,text),public.save_connector_mapping(uuid,jsonb),
  public.set_connector_paused(uuid,boolean),public.replace_connector_key(uuid,text),public.disconnect_connector(uuid),
  public.connector_source(uuid,text),public.connector_ingest(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_sheet_connection(text,jsonb,text),public.save_connector_mapping(uuid,jsonb),
  public.set_connector_paused(uuid,boolean),public.replace_connector_key(uuid,text),public.disconnect_connector(uuid) to authenticated;
grant execute on function public.connector_source(uuid,text),public.connector_ingest(uuid,text,jsonb) to service_role;
