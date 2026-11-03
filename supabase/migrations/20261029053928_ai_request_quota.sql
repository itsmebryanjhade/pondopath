-- Reserve usage before the external request; failures still consume a slot.
create function private.reserve_ai_request(p_expected_revision bigint, p_model text, p_provider text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  business public.businesses;
  reserved integer;
begin
  select * into business from public.businesses where id = member.business_id for share;
  if business.revision <> p_expected_revision then raise exception 'STALE_VERSION'; end if;
  if not business.is_demo then raise exception 'AI_DEMO_ONLY'; end if;
  if p_model is null or p_provider is null or length(p_model) not between 1 and 150 or length(p_provider) not between 1 and 150 then
    raise exception 'VALIDATION_ERROR';
  end if;
  insert into public.ai_usage (business_id, manila_date, request_count, model, provider)
    values (member.business_id, (now() at time zone 'Asia/Manila')::date, 1, p_model, p_provider)
    on conflict (business_id, manila_date) do update
      set request_count = public.ai_usage.request_count + 1, model = excluded.model, provider = excluded.provider
      where public.ai_usage.request_count < business.ai_daily_limit
    returning request_count into reserved;
  if reserved is null then raise exception 'AI_LIMIT'; end if;
  return reserved;
end $$;

create function public.reserve_ai_request(p_expected_revision bigint, p_model text, p_provider text)
returns integer language sql security invoker set search_path = '' as $$
  select private.reserve_ai_request(p_expected_revision, p_model, p_provider)
$$;
revoke all on function private.reserve_ai_request(bigint,text,text), public.reserve_ai_request(bigint,text,text) from public, anon, authenticated;
grant execute on function private.reserve_ai_request(bigint,text,text), public.reserve_ai_request(bigint,text,text) to authenticated;
