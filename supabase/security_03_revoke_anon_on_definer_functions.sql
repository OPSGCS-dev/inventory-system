-- Run this in the Supabase SQL editor (INVENTORY project).
--
-- Fixes the Security Advisor warnings "Function public.fn_... can be executed
-- by the anon role as a SECURITY DEFINER function via /rest/v1/rpc/...".
--
-- SECURITY DEFINER functions run with their owner's (superuser-level) rights.
-- By default Supabase lets anyone, signed in or not, call any function in the
-- public schema through the REST API, so these could be triggered by anyone
-- holding the app's public key. This removes the anonymous and PUBLIC EXECUTE
-- grant from every SECURITY DEFINER function in the public schema.
--
-- Safe for the app:
--   * Nothing in the inventory app, its /api function, or the ticket system
--     calls any database function via rpc.
--   * Database triggers keep working: EXECUTE is only checked when a trigger
--     is created, not each time it fires.
--   * Signed-in users and the service role keep EXECUTE, so
--     public.is_active_app_user() (used by the policies) is untouched.
--
-- Also stops *future* functions created in public from being anonymously
-- callable by default.
--
-- To undo: run security_03_rollback.sql.

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    -- Keep these explicit so signed-in users and the service role are unaffected.
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    raise notice 'anon/public execute revoked on %', r.sig;
    n := n + 1;
  end loop;
  raise notice 'functions updated: %', n;
end $$;

-- Future functions created by the postgres role: no anonymous or PUBLIC
-- execute unless granted deliberately. (Postgres's built-in "PUBLIC may execute"
-- default is database-wide, so it can't be removed with an IN SCHEMA clause;
-- Supabase's own grants to anon/authenticated/service_role are per-schema.)
-- Signed-in users and the service role still get EXECUTE on new functions in
-- public through Supabase's existing schema-level defaults.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
