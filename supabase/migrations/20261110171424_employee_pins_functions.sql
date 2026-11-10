-- Employee PINs: set, check, change, lock.
--
-- A PIN is 4 digits, stored hashed. After 5 wrong tries the employee is
-- locked for 5 minutes. An owner can unlock or set a new PIN at any time.
--
-- Important: these functions report a wrong PIN by RETURNING a result, never
-- by raising an error. An error would undo the wrong-try counter update.

-- ---------------------------------------------------------------------------
-- Internal check, used by every function that acts for an employee.
-- Returns: status 'ok' | 'wrong' | 'locked' | 'unknown'
-- ---------------------------------------------------------------------------

create function private.check_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_max_tries constant integer := 5;
  v_lock_time constant interval := interval '5 minutes';
  v_pin public.employee_pins%rowtype;
  v_tries integer;
begin
  select p.* into v_pin
  from public.employee_pins p
  join public.employees e on e.id = p.employee_id
  where p.employee_id = p_employee_id and e.active
  for update of p;

  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_pin.locked_until);
  end if;

  if p_pin is not null and v_pin.pin_hash = extensions.crypt(p_pin, v_pin.pin_hash) then
    update public.employee_pins
    set failed_attempts = 0, locked_until = null
    where employee_id = p_employee_id;
    return jsonb_build_object('status', 'ok');
  end if;

  v_tries := v_pin.failed_attempts + 1;

  if v_tries >= v_max_tries then
    update public.employee_pins
    set failed_attempts = 0, locked_until = now() + v_lock_time
    where employee_id = p_employee_id;
    return jsonb_build_object('status', 'locked', 'locked_until', now() + v_lock_time);
  end if;

  update public.employee_pins
  set failed_attempts = v_tries
  where employee_id = p_employee_id;
  return jsonb_build_object('status', 'wrong', 'tries_left', v_max_tries - v_tries);
end;
$$;

create function private.is_valid_pin(p_pin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_pin is not null and p_pin ~ '^[0-9]{4}$'
$$;

-- Turns a check_pin result into what the app receives.
create function private.pin_result(p_check jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_check ->> 'status'
    when 'ok' then jsonb_build_object('ok', true)
    when 'wrong' then jsonb_build_object('ok', false, 'error', 'wrong_pin', 'tries_left', p_check -> 'tries_left')
    when 'locked' then jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', p_check -> 'locked_until')
    else jsonb_build_object('ok', false, 'error', 'unknown_employee')
  end
$$;

-- ---------------------------------------------------------------------------
-- For the shop iPad (and owners)
-- ---------------------------------------------------------------------------

-- Checks a PIN. Returns {ok: true} or {ok: false, error, ...}.
create function public.verify_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return private.pin_result(private.check_pin(p_employee_id, p_pin));
end;
$$;

-- An employee changes their own PIN: needs the current one.
create function public.change_employee_pin(p_employee_id uuid, p_current_pin text, p_new_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
begin
  if (select private.current_user_role()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not private.is_valid_pin(p_new_pin) then
    return jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
  end if;

  v_check := private.check_pin(p_employee_id, p_current_pin);
  if v_check ->> 'status' <> 'ok' then
    return private.pin_result(v_check);
  end if;

  update public.employee_pins
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where employee_id = p_employee_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- For owners
-- ---------------------------------------------------------------------------

-- Adds an employee with their first PIN. Returns the new employee id.
create function public.create_employee(p_name text, p_pin text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select private.current_user_role()) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not private.is_valid_pin(p_pin) then
    raise exception 'PIN must be 4 digits' using errcode = '22023';
  end if;

  insert into public.employees (name) values (trim(p_name)) returning id into v_id;

  insert into public.employee_pins (employee_id, pin_hash)
  values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));

  return v_id;
end;
$$;

-- Sets or resets an employee's PIN. Also clears any lock.
create function public.set_employee_pin(p_employee_id uuid, p_new_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not private.is_valid_pin(p_new_pin) then
    raise exception 'PIN must be 4 digits' using errcode = '22023';
  end if;

  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  insert into public.employee_pins (employee_id, pin_hash)
  values (p_employee_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf')))
  on conflict (employee_id) do update
  set pin_hash = excluded.pin_hash,
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();
end;
$$;

-- Clears a lock without changing the PIN.
create function public.unlock_employee(p_employee_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.employee_pins
  set failed_attempts = 0, locked_until = null
  where employee_id = p_employee_id;
end;
$$;

-- Lock state per employee, for the owners' employee list. Never the PIN.
create function public.employee_pin_status()
returns table (employee_id uuid, has_pin boolean, locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select e.id,
         p.employee_id is not null,
         case when p.locked_until > now() then p.locked_until end
  from public.employees e
  left join public.employee_pins p on p.employee_id = e.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what: logged-in accounts only. Each function checks the role.
-- ---------------------------------------------------------------------------

revoke all on function private.check_pin(uuid, text) from public, anon, authenticated;
revoke all on function private.is_valid_pin(text) from public, anon, authenticated;
revoke all on function private.pin_result(jsonb) from public, anon, authenticated;

revoke all on function public.verify_employee_pin(uuid, text) from public, anon;
revoke all on function public.change_employee_pin(uuid, text, text) from public, anon;
revoke all on function public.create_employee(text, text) from public, anon;
revoke all on function public.set_employee_pin(uuid, text) from public, anon;
revoke all on function public.unlock_employee(uuid) from public, anon;
revoke all on function public.employee_pin_status() from public, anon;

grant execute on function public.verify_employee_pin(uuid, text) to authenticated;
grant execute on function public.change_employee_pin(uuid, text, text) to authenticated;
grant execute on function public.create_employee(text, text) to authenticated;
grant execute on function public.set_employee_pin(uuid, text) to authenticated;
grant execute on function public.unlock_employee(uuid) to authenticated;
grant execute on function public.employee_pin_status() to authenticated;
