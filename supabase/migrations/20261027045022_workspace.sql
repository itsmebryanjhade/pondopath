create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  currency text not null default 'PHP' check (currency = 'PHP'),
  opening_date date not null check (opening_date between date '0001-01-01' and date '9999-12-31'),
  opening_cash_cents bigint not null check (opening_cash_cents between 0 and 99999999999),
  opening_locked_at timestamptz,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  is_demo boolean not null default false,
  demo_reference_date date,
  ai_daily_limit integer not null default 50 check (ai_daily_limit between 1 and 50),
  created_at timestamptz not null default now(),
  check ((is_demo and demo_reference_date is not null and demo_reference_date >= opening_date and demo_reference_date <= date '9999-12-02') or
         (not is_demo and demo_reference_date is null))
);

create table public.memberships (
  business_id uuid not null references public.businesses on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'finance')),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  primary key (business_id, user_id),
  unique (user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  contact_name text not null check (length(btrim(contact_name)) between 1 and 200),
  email text check (length(email) <= 254),
  phone text check (length(phone) <= 50),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid not null,
  number text not null check (length(btrim(number)) between 1 and 100),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  due_date date not null check (due_date between date '0001-01-01' and date '9999-12-31'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, number),
  foreign key (customer_id, business_id) references public.customers (id, business_id)
);
create index invoices_customer_idx on public.invoices (customer_id, business_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  payee text not null check (length(btrim(payee)) between 1 and 200),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  due_date date not null check (due_date between date '0001-01-01' and date '9999-12-31'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);
create index expenses_business_idx on public.expenses (business_id);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  kind text not null check (kind in ('receipt', 'expense_payment')),
  invoice_id uuid,
  expense_id uuid,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  payment_date date not null check (payment_date between date '0001-01-01' and date '9999-12-31'),
  reference text check (length(btrim(reference)) between 1 and 100),
  request_id uuid not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  effects jsonb not null default '{}'::jsonb,
  unique (id, business_id),
  unique (business_id, request_id),
  check ((kind = 'receipt' and invoice_id is not null and expense_id is null) or
         (kind = 'expense_payment' and expense_id is not null and invoice_id is null)),
  check ((voided_at is null and voided_by is null and void_reason is null) or
         (voided_at is not null and voided_by is not null and length(btrim(void_reason)) between 1 and 4000)),
  foreign key (invoice_id, business_id) references public.invoices (id, business_id),
  foreign key (expense_id, business_id) references public.expenses (id, business_id)
);
create index cash_movements_invoice_idx on public.cash_movements (invoice_id, business_id);
create index cash_movements_expense_idx on public.cash_movements (expense_id, business_id);
create unique index cash_movements_reference_idx on public.cash_movements (business_id, lower(btrim(reference)))
  where reference is not null and voided_at is null;

create table public.expectations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  remaining_cents bigint not null check (remaining_cents between 0 and amount_cents),
  expected_date date not null check (expected_date between date '0001-01-01' and date '9999-12-31'),
  kind text not null check (kind in ('assumption', 'commitment')),
  state text not null default 'active' check (state in ('active', 'needs_review', 'superseded', 'fulfilled')),
  source_note text not null check (length(btrim(source_note)) between 1 and 4000),
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, business_id),
  foreign key (invoice_id, business_id) references public.invoices (id, business_id)
);
create index expectations_business_idx on public.expectations (business_id);
create unique index expectations_current_invoice_idx on public.expectations (invoice_id, business_id)
  where state in ('active', 'needs_review');

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  invoice_id uuid not null,
  expectation_id uuid,
  assignee_id uuid not null,
  due_date date not null,
  next_action text not null check (length(btrim(next_action)) between 1 and 4000),
  outcome text check (length(outcome) <= 4000),
  next_date date,
  state text not null default 'open' check (state in ('open', 'completed')),
  completion_source text check (completion_source in ('human', 'cash_movement')),
  resolved_by_movement_id uuid,
  automatic_type text check (automatic_type in ('missed_commitment', 'stale_expectation', 'correction_review')),
  correction_movement_id uuid,
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (expectation_id, automatic_type),
  unique (correction_movement_id),
  foreign key (invoice_id, business_id) references public.invoices (id, business_id),
  foreign key (expectation_id, business_id) references public.expectations (id, business_id),
  foreign key (business_id, assignee_id) references public.memberships (business_id, user_id),
  foreign key (resolved_by_movement_id, business_id) references public.cash_movements (id, business_id),
  foreign key (correction_movement_id, business_id) references public.cash_movements (id, business_id)
);
create index followups_business_assignee_idx on public.followups (business_id, assignee_id);
create index followups_invoice_idx on public.followups (invoice_id, business_id);
create index followups_expectation_idx on public.followups (expectation_id, business_id);
create index followups_resolution_idx on public.followups (resolved_by_movement_id, business_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  invoice_id uuid not null,
  recipient text not null check (length(btrim(recipient)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 2000),
  version integer not null default 1 check (version > 0),
  state text not null default 'draft' check (state in ('draft', 'awaiting_review', 'approved', 'rejected', 'reported_sent')),
  approval_basis jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text check (length(rejection_reason) <= 4000),
  reported_sent_at timestamptz,
  reported_channel text check (length(reported_channel) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (invoice_id, business_id) references public.invoices (id, business_id)
);
create index reminders_invoice_idx on public.reminders (invoice_id, business_id);
create index reminders_business_idx on public.reminders (business_id);

create table public.command_receipts (
  business_id uuid not null references public.businesses on delete cascade,
  request_id uuid not null,
  payload_digest text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, request_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses on delete cascade,
  actor_id uuid,
  entity_kind text not null,
  entity_id uuid not null,
  change jsonb not null,
  reason text check (length(reason) <= 4000),
  created_at timestamptz not null default now()
);
create index audit_events_history_idx on public.audit_events (business_id, entity_kind, entity_id, id desc);

create table public.automation_runs (
  business_id uuid not null references public.businesses on delete cascade,
  run_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  error_code text,
  primary key (business_id, run_id)
);

create table public.ai_usage (
  business_id uuid not null references public.businesses on delete cascade,
  manila_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  model text,
  provider text,
  outcomes jsonb not null default '{}'::jsonb,
  primary key (business_id, manila_date)
);

-- Reads use current database membership; editable JWT profile data grants no access.
alter table public.memberships enable row level security;
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
alter table public.businesses enable row level security;
create policy businesses_read on public.businesses for select to authenticated
  using (id in (select business_id from public.memberships where user_id = (select auth.uid())));

do $$
declare table_name text;
begin
  foreach table_name in array array['customers','invoices','expenses','cash_movements','expectations',
    'followups','reminders','command_receipts','audit_events','automation_runs','ai_usage'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy member_read on public.%I for select to authenticated using
      (business_id in (select business_id from public.memberships where user_id = (select auth.uid())))', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

create function private.require_membership() returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare member public.memberships;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select * into member from public.memberships where user_id = auth.uid();
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return member;
end $$;

create function private.reference_date(p_business_id uuid) returns date
language sql stable set search_path = '' as $$
  select case when is_demo then demo_reference_date else (now() at time zone 'Asia/Manila')::date end
  from public.businesses where id = p_business_id
$$;

-- Definer boundary supplies aggregate balances and member labels after reauthorization.
create function private.workspace_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  business public.businesses;
  ref date;
  available numeric;
  invoice_rows jsonb;
  expense_rows jsonb;
  last_success timestamptz;
begin
  select * into strict business from public.businesses where id = member.business_id;
  ref := private.reference_date(business.id);
  if (select count(*) from public.invoices where business_id = business.id) > 1000 or
     (select count(*) from public.expenses where business_id = business.id) > 1000 then
    raise exception 'LIMIT_REACHED';
  end if;
  select business.opening_cash_cents + coalesce(sum(case when kind = 'receipt' then amount_cents else -amount_cents end), 0)
    into available from public.cash_movements
    where business_id = business.id and voided_at is null and payment_date between business.opening_date and ref;
  if abs(available) > 9007199254740991 then raise exception 'VALIDATION_ERROR'; end if;

  select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('paid_cents', coalesce(p.paid,0),
    'outstanding_cents', i.amount_cents - coalesce(p.paid,0)) order by i.due_date,i.id), '[]'::jsonb)
    into invoice_rows from public.invoices i left join (
      select invoice_id, sum(amount_cents) paid from public.cash_movements
      where business_id = business.id and voided_at is null and payment_date between business.opening_date and ref
      group by invoice_id
    ) p on p.invoice_id = i.id where i.business_id = business.id;
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('paid_cents', coalesce(p.paid,0),
    'unpaid_cents', e.amount_cents - coalesce(p.paid,0)) order by e.due_date,e.id), '[]'::jsonb)
    into expense_rows from public.expenses e left join (
      select expense_id, sum(amount_cents) paid from public.cash_movements
      where business_id = business.id and voided_at is null and payment_date between business.opening_date and ref
      group by expense_id
    ) p on p.expense_id = e.id where e.business_id = business.id;
  select max(finished_at) into last_success from public.automation_runs
    where business_id = business.id and status = 'success';
  return jsonb_build_object(
    'business', to_jsonb(business), 'revision', business.revision,
    'actor', jsonb_build_object('userId',member.user_id,'businessId',member.business_id,'role',member.role),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) order by role,user_id),'[]'::jsonb)
      from public.memberships where business_id = business.id),
    'customers', (select coalesce(jsonb_agg(c order by c.name,c.id),'[]'::jsonb) from public.customers c where business_id = business.id),
    'invoices', invoice_rows, 'expenses', expense_rows,
    'expectations', (select coalesce(jsonb_agg(e order by e.confirmed_at desc,e.id),'[]'::jsonb)
      from public.expectations e where business_id = business.id and state in ('active','needs_review')),
    'followups', (select coalesce(jsonb_agg(f order by f.due_date,f.id),'[]'::jsonb) from public.followups f where business_id = business.id),
    'reminders', (select coalesce(jsonb_agg(r order by r.updated_at desc,r.id),'[]'::jsonb) from public.reminders r where business_id = business.id),
    'automation', jsonb_build_object('lastSuccessAt',last_success,'stale',last_success is null or last_success < now() - interval '30 minutes'),
    'forecastInput', jsonb_build_object('referenceDate',ref,'availableCents',available,
      'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id',i->>'id',
        'outstandingCents',(i->>'outstanding_cents')::bigint,'expectation',
        (select jsonb_build_object('id',e.id,'date',e.expected_date,'remainingCents',e.remaining_cents,
          'kind',e.kind,'needsReview',e.state = 'needs_review') from public.expectations e
          where e.invoice_id = (i->>'id')::uuid and e.business_id = business.id and e.state in ('active','needs_review')))), '[]'::jsonb)
        from jsonb_array_elements(invoice_rows) i),
      'expenses', (select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','dueDate',e->>'due_date',
        'unpaidCents',(e->>'unpaid_cents')::bigint)), '[]'::jsonb) from jsonb_array_elements(expense_rows) e))
  );
end $$;

create function private.workspace_history(p_kind text, p_id uuid, p_cursor text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  member public.memberships := private.require_membership();
  cursor_id bigint;
  cursor_time timestamptz;
  events jsonb;
  next_cursor text;
begin
  if p_kind not in ('invoice','expense') or p_kind is null then raise exception 'VALIDATION_ERROR'; end if;
  if not ((p_kind = 'invoice' and exists (select 1 from public.invoices where id = p_id and business_id = member.business_id)) or
          (p_kind = 'expense' and exists (select 1 from public.expenses where id = p_id and business_id = member.business_id))) then
    raise exception 'NOT_FOUND';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9T:+. -]+\|[1-9][0-9]{0,18}$' then raise exception 'VALIDATION_ERROR'; end if;
    cursor_time := split_part(p_cursor,'|',1)::timestamptz;
    cursor_id := split_part(p_cursor,'|',2)::bigint;
  end if;
  select coalesce(jsonb_agg(to_jsonb(page) || jsonb_build_object('id',page.id::text) order by page.created_at desc,page.id desc),'[]'::jsonb)
    into events from (
      select * from public.audit_events where business_id = member.business_id and entity_kind = p_kind and entity_id = p_id
        and (cursor_id is null or (created_at,id) < (cursor_time,cursor_id)) order by created_at desc,id desc limit 20
    ) page;
  if jsonb_array_length(events) = 20 then
    next_cursor := (events->19->>'created_at') || '|' || (events->19->>'id');
  end if;
  return jsonb_build_object('events',events,'nextCursor',next_cursor);
end $$;

create function public.workspace_snapshot() returns jsonb language sql stable security invoker set search_path = ''
  as $$ select private.workspace_snapshot() $$;
create function public.workspace_history(p_kind text, p_id uuid, p_cursor text default null) returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select private.workspace_history(p_kind,p_id,p_cursor) $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.workspace_snapshot(), public.workspace_history(text,uuid,text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.workspace_snapshot(), private.workspace_history(text,uuid,text),
  public.workspace_snapshot(), public.workspace_history(text,uuid,text) to authenticated;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
