-- Drawer counts are entered as a number of each note and coin, not as one total.
-- The total is worked out here, on the server, and the detail is kept.

-- How many of each note and coin, e.g. {"200": 3, "50": 1, "0.5": 4}.
-- Null for counts saved before this change.
alter table public.cash_counts add column breakdown jsonb;

drop function public.log_cash_count(uuid, text, public.cash_count_kind, numeric);

-- Logs an opening or closing drawer count from its notes and coins.
-- Opening: only once, when the day is not opened yet.
-- Closing: once the day is open. It can be redone; the latest count is used.
create function public.log_cash_count(
  p_employee_id uuid,
  p_pin text,
  p_kind public.cash_count_kind,
  p_breakdown jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Moroccan notes and coins, in dirhams.
  v_denominations constant text[] := array['200', '100', '50', '20', '10', '5', '2', '1', '0.5', '0.2', '0.1'];
  v_check jsonb;
  v_day date := public.shop_today();
  v_state text;
  v_entry record;
  v_total numeric := 0;
  v_kept jsonb := '{}'::jsonb;
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if p_kind is null or p_breakdown is null or jsonb_typeof(p_breakdown) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  for v_entry in select key, value from jsonb_each_text(p_breakdown) loop
    if not (v_entry.key = any (v_denominations)) or v_entry.value !~ '^[0-9]{1,4}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_amount');
    end if;
    if v_entry.value::integer > 0 then
      v_total := v_total + v_entry.key::numeric * v_entry.value::integer;
      v_kept := v_kept || jsonb_build_object(v_entry.key, v_entry.value::integer);
    end if;
  end loop;

  v_state := private.day_state(v_day);
  if p_kind = 'opening' and v_state <> 'not_opened' then
    return jsonb_build_object('ok', false, 'error', 'already_opened');
  end if;
  if p_kind = 'closing' and v_state = 'not_opened' then
    return jsonb_build_object('ok', false, 'error', 'day_not_open');
  end if;

  insert into public.cash_counts (day, kind, amount, breakdown, employee_id)
  values (v_day, p_kind, v_total, v_kept, p_employee_id);

  return jsonb_build_object('ok', true, 'state', private.day_state(v_day), 'amount', v_total);
end;
$$;

revoke all on function public.log_cash_count(uuid, text, public.cash_count_kind, jsonb) from public, anon;
grant execute on function public.log_cash_count(uuid, text, public.cash_count_kind, jsonb) to authenticated;
