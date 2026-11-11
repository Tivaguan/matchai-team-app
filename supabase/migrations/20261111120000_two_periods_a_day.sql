-- Availability: up to two periods a day.
--
-- Staff can be free in two separate stretches of the same day, for example
-- 08:00 to 11:00 and again 16:00 to 19:00. The tables already allow several
-- rows for one person on one day; only save_availability refused it.
--
-- New rules for one day in p_days:
--   - either a single {"day", "not_available": true},
--   - or one or two {"day", "from", "to"} periods that do not overlap.
--
-- p_days: [{"day": "2026-11-16", "not_available": true},
--          {"day": "2026-11-17", "from": "08:00", "to": "11:00"},
--          {"day": "2026-11-17", "from": "16:00", "to": "19:00"}, ...]
-- Refused once the week's schedule is published.
--
-- Same name and arguments as before, so who may call it does not change.
create or replace function public.save_availability(
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
  -- Seven days, at most two entries each.
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 14 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  -- Check everything before changing anything.
  for v_entry in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_entry) <> 'object'
      or coalesce(v_entry ->> 'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_days');
    end if;
    v_day := (v_entry ->> 'day')::date;
    v_off := coalesce((v_entry ->> 'not_available')::boolean, false);
    v_from := v_entry ->> 'from';
    v_to := v_entry ->> 'to';

    if v_day not between p_week_start and p_week_start + 6 then
      return jsonb_build_object('ok', false, 'error', 'invalid_days');
    end if;

    if not v_off then
      if coalesce(v_from, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_to, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or v_from::time >= v_to::time then
        return jsonb_build_object('ok', false, 'error', 'invalid_hours');
      end if;
    end if;
  end loop;

  -- One day holds "not available" alone, or one or two periods.
  if exists (
    select 1
    from jsonb_array_elements(p_days) as entry (value)
    group by entry.value ->> 'day'
    having count(*) > 2
      or (count(*) > 1 and bool_or(coalesce((entry.value ->> 'not_available')::boolean, false)))
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  -- Two periods of the same day must not overlap.
  if exists (
    select 1
    from jsonb_array_elements(p_days) with ordinality as first (value, position)
    join jsonb_array_elements(p_days) with ordinality as second (value, position)
      on first.value ->> 'day' = second.value ->> 'day'
      and first.position < second.position
    where (first.value ->> 'from')::time < (second.value ->> 'to')::time
      and (second.value ->> 'from')::time < (first.value ->> 'to')::time
  ) then
    return jsonb_build_object('ok', false, 'error', 'overlapping_hours');
  end if;

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
