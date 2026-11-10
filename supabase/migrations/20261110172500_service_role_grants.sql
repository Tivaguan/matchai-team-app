-- Server-side code (account setup script, notification sender) uses the
-- project's secret key, which runs as service_role. Give it table access
-- explicitly so this does not depend on the project's default settings.
-- Any migration that adds a table must grant it to service_role too.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
