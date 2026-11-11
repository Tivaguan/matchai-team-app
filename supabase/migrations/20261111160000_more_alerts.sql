-- Five more alerts for the owners:
--   day_opened       the opening count was saved
--   drawer_mismatch  the opening count differs from the last closing count
--   all_answered     every employee sent their availability for a week
--   employee_locked  someone is locked out after wrong PINs
--   day_not_closed   no closing count was saved by the end of the day
alter type public.notification_alert add value if not exists 'day_opened';
alter type public.notification_alert add value if not exists 'drawer_mismatch';
alter type public.notification_alert add value if not exists 'all_answered';
alter type public.notification_alert add value if not exists 'employee_locked';
alter type public.notification_alert add value if not exists 'day_not_closed';

-- Remembers which one-time alerts were already sent, so the same event is
-- never announced twice (for example "everyone has answered" for one week).
-- Only the server writes here; no account can read it.
create table public.notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;
grant select, insert, update, delete on public.notification_log to service_role;
