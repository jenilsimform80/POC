#!/bin/sh
# Runs ONCE, when the database volume is first created (docker-entrypoint-initdb.d).
#
# Two roles, so the application cannot weaken its own database guards:
#   timesheets_owner  owns the database/schema/tables; used ONLY by the one-shot `migrate` service.
#   timesheets_app    what the running backend uses: SELECT/INSERT/UPDATE/DELETE only. It is not the
#                     table owner, so it cannot ALTER/DROP tables, DISABLE the period-lock or
#                     audit-append-only triggers, or TRUNCATE (TRUNCATE is a separate privilege).
# Passwords reach SQL as psql variables (:'name'), so they are quoted safely.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" -v dbname="$DB_NAME" <<'SQL'
CREATE ROLE timesheets_owner LOGIN PASSWORD :'owner_pw';
CREATE ROLE timesheets_app   LOGIN PASSWORD :'app_pw';
CREATE DATABASE :"dbname" OWNER timesheets_owner;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" <<'SQL'
ALTER SCHEMA public OWNER TO timesheets_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO timesheets_app;
-- Tables the owner creates later (by migrations) automatically grant the app role data access only.
ALTER DEFAULT PRIVILEGES FOR ROLE timesheets_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timesheets_app;
SQL
