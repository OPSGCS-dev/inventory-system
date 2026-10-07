-- Ownership and Physical Location, part 3 of 3: lock direct writes. RUN AT CUTOVER.
--
-- Run this ONLY after the new version of the app is live (the old version writes
-- stock and History directly and would stop working). From here on, stock and
-- History can only be changed through the functions in part 1, which apply the
-- ownership/location rules, check the user's role, and write the History entry.
--
-- Effect:
--   stock_on_hand, stock_location, inventory_journal, inventory_journal_lines:
--     read  = any active app user (unchanged)
--     write = nobody directly (the functions run with the owner's rights)
--   So History can no longer be edited or forged from the browser either.
--
-- Backs up the old policies first (public.security_stock_policy_backup) so
-- ownership_location_rollback.sql can restore them.

begin;

create table if not exists public.security_stock_policy_backup (
  schemaname text not null, tablename text not null, policyname text not null,
  permissive text, roles text not null, cmd text not null, qual text, with_check text,
  backed_up_at timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public.security_stock_policy_backup enable row level security;

do $$
declare
  r record;
  already boolean := exists (select 1 from public.security_stock_policy_backup);
begin
  for r in
    select * from pg_policies
    where schemaname = 'public'
      and tablename in ('stock_on_hand', 'inventory_journal', 'inventory_journal_lines')
  loop
    if not already then
      insert into public.security_stock_policy_backup (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
      values (r.schemaname, r.tablename, r.policyname, r.permissive, array_to_string(r.roles, ','), r.cmd, r.qual, r.with_check);
    end if;
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "stock on hand read" on public.stock_on_hand for select to authenticated using (public.is_active_app_user());
create policy "journal read" on public.inventory_journal for select to authenticated using (public.is_active_app_user());
create policy "journal lines read" on public.inventory_journal_lines for select to authenticated using (public.is_active_app_user());

commit;
