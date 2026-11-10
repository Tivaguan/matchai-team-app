-- Counter modules: cashier log, expenses, stock.
--
-- Every function here acts for an employee, so it takes their id and PIN and
-- checks the PIN first. Failures are RETURNED as {ok: false, error}, never
-- raised, so the wrong-PIN counter is not rolled back.
--
-- The day rule: an opening drawer count opens the day, a closing count closes
-- it. Stock changes and expenses are only accepted while the day is open.

-- ---------------------------------------------------------------------------
-- Day state
-- ---------------------------------------------------------------------------

create function private.day_state(p_day date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(bool_or(kind = 'closing'), false) then 'closed'
    when coalesce(bool_or(kind = 'opening'), false) then 'open'
    else 'not_opened'
  end
  from public.cash_counts
  where day = p_day
$$;

create or replace function public.get_day_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := public.shop_today();
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object('day', v_day, 'state', private.day_state(v_day));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cashier log
-- ---------------------------------------------------------------------------

-- Logs an opening or closing drawer count.
-- Opening: only once, when the day is not opened yet.
-- Closing: once the day is open. It can be redone; the latest count is used.
create function public.log_cash_count(
  p_employee_id uuid,
  p_pin text,
  p_kind public.cash_count_kind,
  p_amount numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_day date := public.shop_today();
  v_state text;
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if p_kind is null or p_amount is null or p_amount < 0 or p_amount >= 100000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  v_state := private.day_state(v_day);
  if p_kind = 'opening' and v_state <> 'not_opened' then
    return jsonb_build_object('ok', false, 'error', 'already_opened');
  end if;
  if p_kind = 'closing' and v_state = 'not_opened' then
    return jsonb_build_object('ok', false, 'error', 'day_not_open');
  end if;

  insert into public.cash_counts (day, kind, amount, employee_id)
  values (v_day, p_kind, round(p_amount, 2), p_employee_id);

  return jsonb_build_object('ok', true, 'state', private.day_state(v_day));
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

-- Logs cash taken from the drawer, with a reason.
create function public.log_expense(
  p_employee_id uuid,
  p_pin text,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_day date := public.shop_today();
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 100000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if length(v_reason) = 0 or length(v_reason) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  if private.day_state(v_day) <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'day_not_open');
  end if;

  insert into public.expenses (day, amount, reason, employee_id)
  values (v_day, round(p_amount, 2), v_reason, p_employee_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

-- What the counter shows: every active item with its current quantity.
create function public.get_counter_stock()
returns table (
  item_id uuid,
  item_name text,
  unit text,
  category_id uuid,
  category_name text,
  category_sort integer,
  current_quantity numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select i.id, i.name, i.unit, c.id, c.name, c.sort_order,
         i.starting_quantity + coalesce((select sum(s.amount) from public.stock_changes s where s.item_id = i.id), 0)
  from public.stock_items i
  join public.stock_categories c on c.id = i.category_id
  where i.active and c.active
  order by c.sort_order, c.name, i.name;
end;
$$;

-- Adds (positive amount) or removes (negative amount) quantity for one item.
-- Returns the new quantity, and whether this change made the item go low.
create function public.adjust_stock(
  p_employee_id uuid,
  p_pin text,
  p_item_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_item public.stock_items%rowtype;
  v_amount numeric := round(p_amount, 3);
  v_before numeric;
  v_after numeric;
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_check := private.check_pin(p_employee_id, p_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  if v_amount is null or v_amount = 0 or abs(v_amount) >= 100000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if private.day_state(public.shop_today()) <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'day_not_open');
  end if;

  -- Lock the item so two changes at once cannot both read the same quantity.
  select * into v_item from public.stock_items where id = p_item_id and active for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;

  select v_item.starting_quantity + coalesce(sum(amount), 0) into v_before
  from public.stock_changes
  where item_id = p_item_id;

  v_after := v_before + v_amount;
  if v_after < 0 then
    return jsonb_build_object('ok', false, 'error', 'not_enough_stock', 'current_quantity', v_before);
  end if;

  insert into public.stock_changes (item_id, employee_id, amount, quantity_before, quantity_after)
  values (p_item_id, p_employee_id, v_amount, v_before, v_after);

  return jsonb_build_object(
    'ok', true,
    'quantity_after', v_after,
    'became_low', v_before >= v_item.low_stock_level and v_after < v_item.low_stock_level
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what: logged-in accounts only. Each function checks the role.
-- ---------------------------------------------------------------------------

revoke all on function private.day_state(date) from public, anon, authenticated;

revoke all on function public.log_cash_count(uuid, text, public.cash_count_kind, numeric) from public, anon;
revoke all on function public.log_expense(uuid, text, numeric, text) from public, anon;
revoke all on function public.get_counter_stock() from public, anon;
revoke all on function public.adjust_stock(uuid, text, uuid, numeric) from public, anon;

grant execute on function public.log_cash_count(uuid, text, public.cash_count_kind, numeric) to authenticated;
grant execute on function public.log_expense(uuid, text, numeric, text) to authenticated;
grant execute on function public.get_counter_stock() to authenticated;
grant execute on function public.adjust_stock(uuid, text, uuid, numeric) to authenticated;
