-- Opening hours: when the shop needs someone behind the counter.
--
-- One row per day of the week (1 = Monday ... 7 = Sunday). The owners change
-- them on the Team page. The schedule uses them to show the open hours that
-- nobody is scheduled for yet.
create table public.opening_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  closed boolean not null default false,
  open_from time not null default '11:00',
  open_to time not null default '22:00',
  check (open_from < open_to)
);

insert into public.opening_hours (weekday)
select generate_series(1, 7);

alter table public.opening_hours enable row level security;

-- Owners read and change the hours. Rows are never added or removed.
grant select, update on public.opening_hours to authenticated;
create policy "owner reads opening hours" on public.opening_hours
  for select to authenticated
  using ((select private.current_user_role()) = 'owner');
create policy "owner changes opening hours" on public.opening_hours
  for update to authenticated
  using ((select private.current_user_role()) = 'owner')
  with check ((select private.current_user_role()) = 'owner');

grant select, insert, update, delete on public.opening_hours to service_role;
