-- Run this in the Supabase SQL editor (INVENTORY project).
--
-- Fixes the Security Advisor warning "Function ... has a role mutable
-- search_path" (e.g. public.fn_apply_opening_inventory). A function with no
-- fixed search_path resolves unqualified names using whatever the caller's
-- search_path happens to be, which can be abused. This pins every such
-- function in the public schema to: public, extensions, pg_temp.
--
-- Safe: it changes only how unqualified names inside those functions are
-- looked up, and it covers extension schemas (e.g. pgcrypto's crypt()). It
-- does not change what the functions do or who can call them. Functions that
-- already have a search_path, and functions owned by extensions, are skipped.
--
-- To undo: run security_01_function_search_path_rollback.sql.

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
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    raise notice 'search_path pinned on %', r.sig;
  end loop;
end $$;
