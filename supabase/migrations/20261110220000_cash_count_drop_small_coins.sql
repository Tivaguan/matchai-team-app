-- The shop does not use 20 and 10 centime coins, so drawer counts no longer
-- accept them. Same function as before, with a shorter list.

create or replace function public.log_cash_count(
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
  v_denominations constant text[] := array['200', '100', '50', '20', '10', '5', '2', '1', '0.5'];
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
