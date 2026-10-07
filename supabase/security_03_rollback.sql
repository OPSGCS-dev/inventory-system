-- Undo for security_03_revoke_anon_on_definer_functions.sql: gives anon and
-- PUBLIC EXECUTE back on every SECURITY DEFINER function in public, and
-- restores the default for future functions.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to public, anon', r.sig);
  end loop;
end $$;

alter default privileges for role postgres grant execute on functions to public;
alter default privileges for role postgres in schema public grant execute on functions to anon;
