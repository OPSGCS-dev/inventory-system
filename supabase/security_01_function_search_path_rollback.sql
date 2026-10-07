-- Undo for security_01_function_search_path.sql: removes the search_path we
-- pinned (only on functions whose search_path is exactly what we set).

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and 'search_path=public, extensions, pg_temp' = any (coalesce(p.proconfig, '{}'::text[]))
  loop
    execute format('alter function %s reset search_path', r.sig);
    raise notice 'search_path reset on %', r.sig;
  end loop;
end $$;
