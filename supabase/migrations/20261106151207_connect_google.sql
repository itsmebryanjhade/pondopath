-- Connect Google: one Google sign-in per business (sealed refresh token, server-only), Drive file connections
-- (kind 'drive_file') and a key-less, service_role-only door into the shared connector ingest core.

create table public.google_connections (
  business_id uuid primary key references public.businesses on delete cascade,
  owner_id uuid not null,
  account_email text not null check (length(account_email) between 3 and 320),
  refresh_token_sealed text check (refresh_token_sealed is null or (refresh_token_sealed ~ '^v1\.' and length(refresh_token_sealed)<=4096)),
  scopes text[] not null default '{}' check (cardinality(scopes)<=10),
  status text not null check (status in ('connected','needs_reconnect','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='disconnected')=(refresh_token_sealed is null))
);
alter table public.google_connections enable row level security;
create policy google_connections_member_read on public.google_connections for select to authenticated
  using (business_id in (select business_id from public.memberships where user_id = (select auth.uid())));
revoke all on public.google_connections from public,anon,authenticated;
-- Members may see who is connected and the status, never the sealed token.
grant select (business_id,owner_id,account_email,scopes,status,created_at,updated_at) on public.google_connections to authenticated;
grant all on public.google_connections to service_role;

alter table public.intake_sources
  add column sync_lease_until timestamptz,
  add column google_file_id text check (google_file_id is null or google_file_id ~ '^[A-Za-z0-9_-]{10,200}$');
alter table public.intake_sources drop constraint intake_sources_connector_shape;
alter table public.intake_sources add constraint intake_sources_connector_shape
  check ((kind in ('google_sheet','drive_file'))=(connector_status is not null) and (kind='drive_file')=(google_file_id is not null));
-- Auto mappings carry the owner's left-out rows and label changes, so they need more room than column mappings.
alter table public.intake_sources drop constraint intake_sources_mapping_check;
alter table public.intake_sources add constraint intake_sources_mapping_check
  check (mapping is null or (jsonb_typeof(mapping)='object' and octet_length(mapping::text)<=65536));
create unique index intake_sources_one_live_drive_file on public.intake_sources (business_id,google_file_id)
  where kind='drive_file' and connector_status<>'disconnected';
create index intake_sources_drive_due on public.intake_sources (last_run_at nulls first) where kind='drive_file' and connector_status='active';

-- Owner management now covers both connector kinds.
create or replace function private.owned_connector(p_source_id uuid) returns public.intake_sources
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); source public.intake_sources;
begin
  if member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.businesses where id=member.business_id for update;
  select * into source from public.intake_sources where id=p_source_id and business_id=member.business_id and kind in ('google_sheet','drive_file') for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  return source;
end $$;

create or replace function public.save_connector_mapping(p_source_id uuid,p_mapping jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.connector_status not in ('awaiting_mapping','active','paused') or p_mapping is null or jsonb_typeof(p_mapping)<>'object'
    or coalesce(p_mapping->>'kind','') not in ('invoice','expense','mixed','auto') or octet_length(p_mapping::text)>65536 then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set mapping=p_mapping,
    connector_status=case when connector_status='paused' then 'paused' else 'active' end where id=source.id;
end $$;

-- Drive files have no connection key.
create or replace function public.replace_connector_key(p_source_id uuid,p_key_hash text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.kind<>'google_sheet' or source.connector_status='disconnected' or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set connector_key_hash=p_key_hash where id=source.id;
end $$;

create function private.google_file_settings_valid(p_settings jsonb) returns boolean
language sql immutable set search_path='' as $$
  select p_settings is not null and jsonb_typeof(p_settings)='object' and octet_length(p_settings::text)<=2048
    and (select array_agg(key order by key) from jsonb_object_keys(p_settings) key) <@ array['fileId','mimeType','name','tab']
    and coalesce(p_settings->>'fileId','') ~ '^[A-Za-z0-9_-]{10,200}$'
    and length(btrim(coalesce(p_settings->>'name',''))) between 1 and 200
    and p_settings->>'mimeType' in ('application/vnd.google-apps.spreadsheet','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/vnd.ms-excel')
    and (p_settings->'tab' is null or jsonb_typeof(p_settings->'tab')='null' or length(coalesce(p_settings->>'tab','')) between 1 and 200)
$$;

create function public.create_google_file_connection(p_label text,p_settings jsonb) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership(); v_id uuid;
begin
  if member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 200 or not private.google_file_settings_valid(p_settings) then raise exception 'VALIDATION_ERROR'; end if;
  perform 1 from public.businesses where id=member.business_id for update;
  perform 1 from public.google_connections where business_id=member.business_id and status='connected';
  if not found then raise exception 'GOOGLE_RECONNECT'; end if;
  if exists (select 1 from public.intake_sources where business_id=member.business_id and kind='drive_file'
    and google_file_id=p_settings->>'fileId' and connector_status<>'disconnected') then raise exception 'DUPLICATE_REFERENCE'; end if;
  if (select count(*) from public.intake_sources where business_id=member.business_id)>=20 then raise exception 'LIMIT_REACHED'; end if;
  insert into public.intake_sources(business_id,kind,label,created_by,connector_status,connector_settings,google_file_id)
    values(member.business_id,'drive_file',btrim(p_label),member.user_id,'awaiting_first_read',p_settings,p_settings->>'fileId') returning id into v_id;
  return v_id;
end $$;

-- The owner picks the tab before the first read; changing it later restarts setup.
create function public.set_google_file_tab(p_source_id uuid,p_tab text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare source public.intake_sources:=private.owned_connector(p_source_id);
begin
  if source.kind<>'drive_file' or source.connector_status='disconnected' or p_tab is null or length(p_tab) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  update public.intake_sources set connector_settings=(connector_settings-'headers'-'samples')||jsonb_build_object('tab',p_tab),
    connector_status=case when connector_settings->>'tab' is distinct from p_tab then 'awaiting_first_read' else connector_status end
    where id=source.id;
end $$;

create function public.disconnect_google() returns void
language plpgsql volatile security definer set search_path='' as $$
declare member public.memberships:=private.require_membership();
begin
  if member.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.businesses where id=member.business_id for update;
  update public.google_connections set status='disconnected',refresh_token_sealed=null,updated_at=now() where business_id=member.business_id;
  update public.intake_sources set connector_status='disconnected',sync_lease_until=null
    where business_id=member.business_id and kind='drive_file' and connector_status<>'disconnected';
end $$;

-- Server-only (service_role) functions for the app's Google code.
create function public.google_connection_save(p_business uuid,p_owner uuid,p_email text,p_sealed text,p_scopes text[]) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from public.memberships where business_id=p_business and user_id=p_owner and role='owner';
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_sealed is null or p_sealed !~ '^v1\.' or p_email is null or length(p_email) not between 3 and 320 or cardinality(coalesce(p_scopes,'{}'))>10 then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.google_connections(business_id,owner_id,account_email,refresh_token_sealed,scopes,status)
    values(p_business,p_owner,p_email,p_sealed,coalesce(p_scopes,'{}'),'connected')
  on conflict (business_id) do update set owner_id=excluded.owner_id,account_email=excluded.account_email,
    refresh_token_sealed=excluded.refresh_token_sealed,scopes=excluded.scopes,status='connected',updated_at=now();
end $$;

create function public.google_connection_status(p_business uuid,p_status text) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_status not in ('connected','needs_reconnect') then raise exception 'VALIDATION_ERROR'; end if;
  update public.google_connections set status=p_status,updated_at=now() where business_id=p_business and status<>'disconnected';
end $$;

create function public.google_connection_token(p_business uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_sealed text;
begin
  select refresh_token_sealed into v_sealed from public.google_connections where business_id=p_business and status='connected';
  if v_sealed is null then raise exception 'GOOGLE_RECONNECT'; end if;
  return v_sealed;
end $$;

create function public.google_file_source(p_source_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source public.intake_sources; v_google text;
begin
  select * into source from public.intake_sources where id=p_source_id and kind='drive_file' and connector_status<>'disconnected';
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  select status into v_google from public.google_connections where business_id=source.business_id;
  return jsonb_build_object('businessId',source.business_id,'status',source.connector_status,'mapping',source.mapping,
    'settings',source.connector_settings,'connectedBy',source.created_by,'fileId',source.google_file_id,
    'tab',source.connector_settings->>'tab','googleStatus',coalesce(v_google,'disconnected'));
end $$;

create function public.google_claim_due(p_limit integer,p_business uuid default null) returns uuid[]
language plpgsql volatile security definer set search_path='' as $$
declare v_ids uuid[];
begin
  with due as (
    select s.id from public.intake_sources s join public.google_connections g on g.business_id=s.business_id and g.status='connected'
    where s.kind='drive_file' and s.connector_status='active' and (p_business is null or s.business_id=p_business)
      and (s.last_run_at is null or s.last_run_at<now()-interval '10 minutes') and (s.sync_lease_until is null or s.sync_lease_until<now())
    order by s.last_run_at nulls first,s.id limit least(greatest(coalesce(p_limit,5),1),20)
    for update of s skip locked),
  claimed as (update public.intake_sources set sync_lease_until=now()+interval '3 minutes' where id in (select id from due) returning id)
  select coalesce(array_agg(id),'{}') into v_ids from claimed;
  return v_ids;
end $$;

create function public.google_claim_source(p_source_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
  update public.intake_sources s set sync_lease_until=now()+interval '3 minutes'
  where s.id=p_source_id and s.kind='drive_file' and s.connector_status in ('awaiting_first_read','awaiting_mapping','active','paused')
    and (s.sync_lease_until is null or s.sync_lease_until<now())
    and exists (select 1 from public.google_connections g where g.business_id=s.business_id and g.status='connected');
  return found;
end $$;

-- Shared ingest core, moved unchanged from connector_ingest (20261106101246) except for the door check and the lease release.
create function private.connector_ingest_core(p_source_id uuid,p_key text,p_run jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_business uuid; source public.intake_sources; existing public.intake_connector_runs; v_run_id text; v_result text;
  results jsonb:='[]'; first_read jsonb; actual_counts jsonb; rejected jsonb;
begin
  if p_source_id is null then raise exception 'UNAUTHENTICATED'; end if;
  select business_id into v_business from public.intake_sources where id=p_source_id;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  -- Business first, then source: the same lock order as staging and review, so overlapping runs serialize.
  perform 1 from public.businesses where id=v_business for update;
  select * into source from public.intake_sources where id=p_source_id and business_id=v_business for update;
  -- n8n door: a Sheet connection proven by its key. Google door (no key): a Drive file connection, callable only by service_role.
  if source.connector_status='disconnected' or (p_key is not null and (source.kind<>'google_sheet'
      or source.connector_key_hash is distinct from encode(sha256(convert_to(p_key,'UTF8')),'hex')))
    or (p_key is null and source.kind<>'drive_file') then raise exception 'UNAUTHENTICATED'; end if;
  perform private.assert_command_keys(p_run,array['runId','result','counts'],array['errorCode','firstRead','rows']);
  v_run_id:=btrim(p_run->>'runId');
  v_result:=p_run->>'result';
  if length(coalesce(v_run_id,'')) not between 1 and 200 or v_result not in ('staged','paused','awaiting_mapping','failed','first_read')
    or jsonb_typeof(p_run->'counts')<>'object' or octet_length((p_run->'counts')::text)>65536
    or (p_run ? 'errorCode' and coalesce(p_run->>'errorCode','') !~ '^[A-Z_]{1,64}$') then raise exception 'VALIDATION_ERROR'; end if;
  select * into existing from public.intake_connector_runs where source_id=source.id and run_id=v_run_id;
  if found then
    if source.kind='drive_file' then update public.intake_sources set sync_lease_until=null where id=source.id; end if;
    return jsonb_build_object('replayed',true,'result',existing.result,'counts',existing.counts,'errorCode',existing.error_code,'results','[]'::jsonb);
  end if;

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
  if source.kind='drive_file' then update public.intake_sources set sync_lease_until=null where id=source.id; end if;
  delete from public.intake_connector_runs where source_id=source.id and id not in
    (select id from public.intake_connector_runs where source_id=source.id order by received_at desc,id desc limit 200);
  return jsonb_build_object('replayed',false,'result',v_result,'counts',actual_counts,'errorCode',p_run->>'errorCode','results',results);
end $$;

create or replace function public.connector_ingest(p_source_id uuid,p_key text,p_run jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_source_id is null or p_key is null or length(p_key) not between 32 and 200 then raise exception 'UNAUTHENTICATED'; end if;
  return private.connector_ingest_core(p_source_id,p_key,p_run);
end $$;

create function public.google_file_ingest(p_source_id uuid,p_run jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  return private.connector_ingest_core(p_source_id,null,p_run);
end $$;

revoke all on function private.connector_ingest_core(uuid,text,jsonb),private.google_file_settings_valid(jsonb) from public,anon,authenticated;
revoke all on function public.create_google_file_connection(text,jsonb),public.set_google_file_tab(uuid,text),public.disconnect_google(),
  public.google_connection_save(uuid,uuid,text,text,text[]),public.google_connection_status(uuid,text),public.google_connection_token(uuid),
  public.google_file_source(uuid),public.google_file_ingest(uuid,jsonb),public.google_claim_due(integer,uuid),public.google_claim_source(uuid)
  from public,anon,authenticated;
grant execute on function public.create_google_file_connection(text,jsonb),public.set_google_file_tab(uuid,text),public.disconnect_google() to authenticated;
grant execute on function public.google_connection_save(uuid,uuid,text,text,text[]),public.google_connection_status(uuid,text),public.google_connection_token(uuid),
  public.google_file_source(uuid),public.google_file_ingest(uuid,jsonb),public.google_claim_due(integer,uuid),public.google_claim_source(uuid) to service_role;
