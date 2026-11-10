-- Employees cannot change their own PIN. Only owners set or reset PINs
-- (public.set_employee_pin), so the self-service function is removed.

drop function if exists public.change_employee_pin(uuid, text, text);
