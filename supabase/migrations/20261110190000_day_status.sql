-- The shop day: opened by an opening drawer count, closed by a closing one.
-- The counter iPad uses this to decide which screen to show.
-- Returns {day, state} where state is 'not_opened' | 'open' | 'closed'.

create function public.get_day_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := public.shop_today();
  v_opened boolean;
  v_closed boolean;
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select
    coalesce(bool_or(kind = 'opening'), false),
    coalesce(bool_or(kind = 'closing'), false)
  into v_opened, v_closed
  from public.cash_counts
  where day = v_day;

  return jsonb_build_object(
    'day', v_day,
    'state', case
      when v_closed then 'closed'
      when v_opened then 'open'
      else 'not_opened'
    end
  );
end;
$$;

revoke all on function public.get_day_status() from public, anon;
grant execute on function public.get_day_status() to authenticated;
