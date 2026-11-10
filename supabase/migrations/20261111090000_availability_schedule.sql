-- Weekly availability and schedule.
--
-- Staff fill in their free hours on a public page, from their own phone, with
-- no login: they pick their name and enter their PIN. So these functions can
-- be called by anyone (anon), and each one that touches a person's data checks
-- that person's PIN first.
--
-- Owners read availability and build the schedule straight from the tables
-- (their access rules already allow it). A week is visible on the public
-- schedule page only once an owner publishes it.

-- A week is named by its Monday.
create function private.is_monday(p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_day is not null and extract(isodow from p_day) = 1
$$;

create function private.is_week_published(p_week_start date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select published from public.schedule_weeks where week_start = p_week_start), false)
$$;

-- ---------------------------------------------------------------------------
-- Public: the names to pick from
-- ---------------------------------------------------------------------------

create function public.get_availability_roster()
returns table (employee_id uuid, employee_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select id, name from public.employees where active order by name
$$;

-- ---------------------------------------------------------------------------
-- Public, with PIN: read and save my own availability for one week
-- ---------------------------------------------------------------------------

-- Returns {ok, published, days: [{day, not_available, from, to}]}.
create function public.get_my_availability(p_employee_id uuid, p_pin text, p_week_start date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
begin
  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if not private.is_monday(p_week_start) then
    return jsonb_build_object('ok', false, 'error', 'invalid_week');
  end if;

  return jsonb_build_object(
    'ok', true,
    'published', private.is_week_published(p_week_start),
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day', a.day,
          'not_available', a.not_available,
          'from', to_char(a.from_time, 'HH24:MI'),
          'to', to_char(a.to_time, 'HH24:MI')
        )
        order by a.day, a.from_time
      )
      from public.availability a
      where a.employee_id = p_employee_id
        and a.day between p_week_start and p_week_start + 6
    ), '[]'::jsonb)
  );
end;
$$;

-- Replaces my answers for one week.
-- p_days: [{"day": "2026-11-16", "not_available": true}
--          {"day": "2026-11-17", "not_available": false, "from": "11:00", "to": "18:30"}, ...]
-- Refused once the week's schedule is published.
create function public.save_availability(
  p_employee_id uuid,
  p_pin text,
  p_week_start date,
  p_days jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_entry jsonb;
  v_day date;
  v_off boolean;
  v_from text;
  v_to text;
  v_seen date[] := '{}';
begin
  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if not private.is_monday(p_week_start) then
    return jsonb_build_object('ok', false, 'error', 'invalid_week');
  end if;
  if private.is_week_published(p_week_start) then
    return jsonb_build_object('ok', false, 'error', 'week_published');
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 7 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  -- Check everything before changing anything.
  for v_entry in select value from jsonb_array_elements(p_days) loop
    if coalesce(v_entry ->> 'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_days');
    end if;
    v_day := (v_entry ->> 'day')::date;
    v_off := coalesce((v_entry ->> 'not_available')::boolean, false);
    v_from := v_entry ->> 'from';
    v_to := v_entry ->> 'to';

    if v_day not between p_week_start and p_week_start + 6 or v_day = any (v_seen) then
      return jsonb_build_object('ok', false, 'error', 'invalid_days');
    end if;
    v_seen := v_seen || v_day;

    if not v_off then
      if coalesce(v_from, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_to, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or v_from::time >= v_to::time then
        return jsonb_build_object('ok', false, 'error', 'invalid_hours');
      end if;
    end if;
  end loop;

  delete from public.availability
  where employee_id = p_employee_id
    and day between p_week_start and p_week_start + 6;

  insert into public.availability (employee_id, day, not_available, from_time, to_time)
  select
    p_employee_id,
    (value ->> 'day')::date,
    coalesce((value ->> 'not_available')::boolean, false),
    case when coalesce((value ->> 'not_available')::boolean, false) then null else (value ->> 'from')::time end,
    case when coalesce((value ->> 'not_available')::boolean, false) then null else (value ->> 'to')::time end
  from jsonb_array_elements(p_days);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public: the published schedule for one week
-- ---------------------------------------------------------------------------

-- Returns {published, shifts: [{name, day, from, to}]}. Nothing is shown for
-- a week that is not published.
create function public.get_published_schedule(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_monday(p_week_start) or not private.is_week_published(p_week_start) then
    return jsonb_build_object('published', false, 'shifts', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'published', true,
    'shifts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', e.name,
          'day', s.day,
          'from', to_char(s.from_time, 'HH24:MI'),
          'to', to_char(s.to_time, 'HH24:MI')
        )
        order by s.day, s.from_time, e.name
      )
      from public.shifts s
      join public.employees e on e.id = s.employee_id
      where s.day between p_week_start and p_week_start + 6
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function private.is_monday(date) from public, anon, authenticated;
revoke all on function private.is_week_published(date) from public, anon, authenticated;

revoke all on function public.get_availability_roster() from public;
revoke all on function public.get_my_availability(uuid, text, date) from public;
revoke all on function public.save_availability(uuid, text, date, jsonb) from public;
revoke all on function public.get_published_schedule(date) from public;

grant execute on function public.get_availability_roster() to anon, authenticated;
grant execute on function public.get_my_availability(uuid, text, date) to anon, authenticated;
grant execute on function public.save_availability(uuid, text, date, jsonb) to anon, authenticated;
grant execute on function public.get_published_schedule(date) to anon, authenticated;
