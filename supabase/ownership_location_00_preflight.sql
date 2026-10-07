-- Ownership / Physical Location: PRE-FLIGHT CHECK. Read-only: it changes nothing.
--
-- Run this in the production SQL editor BEFORE running ownership_location_01_schema.sql, and send
-- me the result. It lists things the repo's schema files can't show me: triggers, functions and
-- constraints that exist in the live database (for example the fn_apply_stock_adjustment and
-- fn_apply_opening_inventory functions), so I can confirm nothing in there would double-apply or
-- block what the new functions do.

select kind, detail from (
  select 1 as o, 'trigger' as kind,
         c.relname || '  |  ' || t.tgname || '  |  ' || pg_get_triggerdef(t.oid) as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname = 'public'

  union all
  select 2, 'function',
         p.proname || ' => ' || left(pg_get_functiondef(p.oid), 2500)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (p.proname like 'fn\_%' or p.proname ilike '%stock%' or p.proname ilike '%inventory%' or p.proname ilike '%journal%')

  union all
  select 3, 'constraint',
         conrelid::regclass::text || '  |  ' || conname || '  |  ' || pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid in ('public.inventory_journal'::regclass, 'public.inventory_journal_lines'::regclass, 'public.stock_on_hand'::regclass)

  union all
  select 4, 'row counts',
         'stock_on_hand=' || (select count(*) from public.stock_on_hand)
         || ', project_parts=' || (select count(*) from public.project_parts)
         || ', parts=' || (select count(*) from public.parts)
         || ', inventory_journal=' || (select count(*) from public.inventory_journal)

  union all
  select 5, 'entity', id || '  ' || name from public.projects
) x
order by o, detail;
