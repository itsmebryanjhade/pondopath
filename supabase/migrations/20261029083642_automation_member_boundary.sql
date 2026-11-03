alter function public.check_missed_commitments() set schema private;
create function public.check_missed_commitments() returns jsonb
language sql security invoker set search_path = '' as $$
  select private.check_missed_commitments()
$$;
revoke all on function private.check_missed_commitments(), public.check_missed_commitments() from public,anon,authenticated;
grant execute on function private.check_missed_commitments(), public.check_missed_commitments() to authenticated;
