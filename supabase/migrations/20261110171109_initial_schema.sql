-- Matchai Team App: tables, links and access rules.
--
-- Access model
--   owner   : logged-in admin, reads and manages everything.
--   counter : the shared account the shop iPad is logged in with.
--   anon    : public pages (availability, schedule). No direct table access.
-- Employees have no account. Everything they do goes through database
-- functions (added in later migrations) that check their PIN first.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create schema if not exists private;

create type public.user_role as enum ('owner', 'counter');
create type public.cash_count_kind as enum ('opening', 'closing');
create type public.notification_alert as enum (
  'low_stock',
  'day_closed',
  'expense_logged',
  'availability_reminder'
);

-- The shop's calendar day, in Morocco time.
create function public.shop_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Casablanca')::date
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Role of the logged-in account (null if it has no profile).
create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- PINs live apart from employees so that no account, not even an owner,
-- can read the hashes. Only PIN-checking functions touch this table.
create table public.employee_pins (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

create table public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.stock_categories (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  unit text not null default '',
  starting_quantity numeric(12, 3) not null default 0 check (starting_quantity >= 0),
  low_stock_level numeric(12, 3) not null default 0 check (low_stock_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index stock_items_category_id_idx on public.stock_items (category_id);

create table public.stock_changes (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.stock_items (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  amount numeric(12, 3) not null check (amount <> 0),
  quantity_before numeric(12, 3) not null,
  quantity_after numeric(12, 3) not null,
  created_at timestamptz not null default now(),
  check (quantity_after = quantity_before + amount)
);

create index stock_changes_item_id_created_at_idx on public.stock_changes (item_id, created_at);
create index stock_changes_employee_id_idx on public.stock_changes (employee_id);
create index stock_changes_created_at_idx on public.stock_changes (created_at);

-- Current quantity = starting quantity + all changes. Never stored.
create view public.stock_levels
with (security_invoker = true)
as
select
  i.id as item_id,
  i.starting_quantity + coalesce(sum(c.amount), 0) as current_quantity,
  i.starting_quantity + coalesce(sum(c.amount), 0) < i.low_stock_level as is_low
from public.stock_items i
left join public.stock_changes c on c.item_id = i.id
group by i.id;

-- ---------------------------------------------------------------------------
-- Cashier log and expenses
-- ---------------------------------------------------------------------------

create table public.cash_counts (
  id bigint generated always as identity primary key,
  day date not null default public.shop_today(),
  kind public.cash_count_kind not null,
  amount numeric(10, 2) not null check (amount >= 0),
  employee_id uuid not null references public.employees (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- A recount adds a new row. The latest row per day and kind is the one used.
create index cash_counts_day_kind_created_at_idx on public.cash_counts (day, kind, created_at desc);
create index cash_counts_employee_id_idx on public.cash_counts (employee_id);

create table public.expenses (
  id bigint generated always as identity primary key,
  day date not null default public.shop_today(),
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  employee_id uuid not null references public.employees (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index expenses_day_idx on public.expenses (day);
create index expenses_employee_id_idx on public.expenses (employee_id);

-- ---------------------------------------------------------------------------
-- Availability and schedule
-- ---------------------------------------------------------------------------

-- One row per free time range. A day marked "not available" is a single row
-- with no hours. Same shape as shifts, to keep auto-scheduling possible later.
create table public.availability (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees (id) on delete restrict,
  day date not null,
  not_available boolean not null default false,
  from_time time,
  to_time time,
  created_at timestamptz not null default now(),
  check (
    (not_available and from_time is null and to_time is null)
    or (not not_available and from_time is not null and to_time is not null and from_time < to_time)
  )
);

create index availability_day_idx on public.availability (day);
create index availability_employee_id_day_idx on public.availability (employee_id, day);

-- One row per week (Monday). The public schedule page only shows published weeks.
create table public.schedule_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  published boolean not null default false,
  published_at timestamptz
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  day date not null,
  from_time time not null,
  to_time time not null,
  created_at timestamptz not null default now(),
  check (from_time < to_time)
);

create index shifts_day_idx on public.shifts (day);
create index shifts_employee_id_day_idx on public.shifts (employee_id, day);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- No row means the alert is on.
create table public.notification_settings (
  owner_id uuid not null references public.profiles (user_id) on delete cascade,
  alert public.notification_alert not null,
  enabled boolean not null default true,
  primary key (owner_id, alert)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_owner_id_idx on public.push_subscriptions (owner_id);

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------

-- Start from nothing, whatever the project's default settings are.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function public.shop_today() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.employee_pins enable row level security;
alter table public.stock_categories enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_changes enable row level security;
alter table public.cash_counts enable row level security;
alter table public.expenses enable row level security;
alter table public.availability enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.shifts enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;

-- employee_pins: no grants and no policies on purpose. Functions only.

-- profiles: everyone sees their own row, owners see all.
grant select on public.profiles to authenticated;
create policy "read own profile or all as owner" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.current_user_role()) = 'owner');

-- Things the owners manage and the iPad needs to show.
grant select, insert, update, delete on public.employees to authenticated;
create policy "owner and counter read employees" on public.employees
  for select to authenticated
  using ((select private.current_user_role()) in ('owner', 'counter'));
create policy "owner manages employees" on public.employees
  for all to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

grant select, insert, update, delete on public.stock_categories to authenticated;
create policy "owner and counter read categories" on public.stock_categories
  for select to authenticated
  using ((select private.current_user_role()) in ('owner', 'counter'));
create policy "owner manages categories" on public.stock_categories
  for all to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

grant select, insert, update, delete on public.stock_items to authenticated;
create policy "owner and counter read items" on public.stock_items
  for select to authenticated
  using ((select private.current_user_role()) in ('owner', 'counter'));
create policy "owner manages items" on public.stock_items
  for all to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

-- Logs: owners can read them. Nobody can edit or delete them.
grant select on public.stock_changes to authenticated;
create policy "owner reads stock changes" on public.stock_changes
  for select to authenticated
  using ((select private.current_user_role()) = 'owner');

grant select on public.stock_levels to authenticated;

grant select on public.cash_counts to authenticated;
create policy "owner reads cash counts" on public.cash_counts
  for select to authenticated
  using ((select private.current_user_role()) = 'owner');

grant select on public.expenses to authenticated;
create policy "owner reads expenses" on public.expenses
  for select to authenticated
  using ((select private.current_user_role()) = 'owner');

grant select on public.availability to authenticated;
create policy "owner reads availability" on public.availability
  for select to authenticated
  using ((select private.current_user_role()) = 'owner');

-- Schedule: owners build it.
grant select, insert, update, delete on public.schedule_weeks to authenticated;
create policy "owner manages schedule weeks" on public.schedule_weeks
  for all to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

grant select, insert, update, delete on public.shifts to authenticated;
create policy "owner manages shifts" on public.shifts
  for all to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

-- Notifications: each owner handles only their own rows.
grant select, insert, update, delete on public.notification_settings to authenticated;
create policy "owner manages own notification settings" on public.notification_settings
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.current_user_role()) = 'owner')
  with check (owner_id = (select auth.uid()) and (select private.current_user_role()) = 'owner');

grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy "owner manages own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select private.current_user_role()) = 'owner')
  with check (owner_id = (select auth.uid()) and (select private.current_user_role()) = 'owner');
