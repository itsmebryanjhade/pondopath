-- A confirmed account can establish exactly one private business and owner membership.
create function public.create_business_workspace(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_business uuid;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 200 or
     length(btrim(coalesce(p_display_name, ''))) not between 1 and 200 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'EMAIL_UNCONFIRMED' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = v_user) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;

  insert into public.businesses (name, opening_date, opening_cash_cents)
    values (btrim(p_name), (now() at time zone 'Asia/Manila')::date, 0)
    returning id into v_business;
  insert into public.memberships (business_id, user_id, role, display_name)
    values (v_business, v_user, 'owner', btrim(p_display_name));
  return v_business;
end $$;

revoke all on function public.create_business_workspace(text, text) from public, anon, authenticated;
grant execute on function public.create_business_workspace(text, text) to authenticated;
