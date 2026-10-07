-- Undo for the Ownership / Physical Location change (parts 1 to 3).
--
-- 1. Restores the old stock/History policies (if part 3 was run).
-- 2. If the opening import was run, puts stock_on_hand back to how it was
--    (public.stock_on_hand_pre_import), so the OLD app shows its old numbers.
--    NOTE: anything changed through the new functions since then is lost from
--    stock_on_hand (the History entries stay).
-- 3. Removes the new functions, the stock_location table and the private schema.
--
-- parts.storage_qty / barn_qty were never touched, so the old Storage and Barn
-- numbers are still there.

begin;

-- 1. old policies
do $$
declare r record;
begin
  if to_regclass('public.security_stock_policy_backup') is not null
     and exists (select 1 from public.security_stock_policy_backup) then
    for r in
      select * from pg_policies
      where schemaname = 'public' and tablename in ('stock_on_hand', 'inventory_journal', 'inventory_journal_lines')
    loop
      execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    end loop;
    for r in select * from public.security_stock_policy_backup order by tablename, policyname loop
      execute format('create policy %I on %I.%I as %s for %s to %s',
                     r.policyname, r.schemaname, r.tablename, lower(coalesce(r.permissive, 'permissive')), r.cmd, r.roles)
        || case when r.qual is not null then ' using (' || r.qual || ')' else '' end
        || case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end;
    end loop;
    delete from public.security_stock_policy_backup;
  end if;
end $$;

-- 2. old ownership numbers
do $$
begin
  if to_regclass('public.stock_on_hand_pre_import') is not null then
    delete from public.stock_on_hand;
    insert into public.stock_on_hand (project_id, part_gcs_id, quantity, updated_at)
      select project_id, part_gcs_id, quantity, updated_at from public.stock_on_hand_pre_import;
  end if;
end $$;

-- 3. new objects
drop function if exists public.fn_check_stock_invariants();
drop function if exists public.fn_receive_po_parts(bigint);
drop function if exists public.fn_apply_count(text, text, jsonb);
drop function if exists public.fn_record_use(integer, text, bigint, integer, text);
drop function if exists public.fn_move_location(integer, text, bigint, text, bigint, integer, text);
drop function if exists public.fn_stock_transfer(integer, bigint, bigint, integer, text, text, text);
drop schema if exists inv_private cascade;
drop table if exists public.stock_location;

-- Journal constraint back to the old entry types. NOT VALID so existing
-- location_move / opening entries stay in History.
alter table public.inventory_journal drop constraint if exists inventory_journal_entry_type_check;
alter table public.inventory_journal add constraint inventory_journal_entry_type_check
  check (entry_type in ('adjustment', 'location_adjustment', 'use', 'transfer', 'count', 'po_received')) not valid;

commit;

-- Optional clean-up afterwards, once you are certain:
--   drop table public.stock_on_hand_pre_import;
--   drop table public.security_stock_policy_backup;
