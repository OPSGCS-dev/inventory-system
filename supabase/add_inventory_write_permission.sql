-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
--
-- Everyone signed in can SEE the inventory pages; only someone with the 'inventory' role can CHANGE anything.
-- The screens already hide the buttons from everyone else. This makes the database enforce it too, so a
-- changed page (or a direct call with the app's key) can't get round it.
--
-- Already enforced in the database, not touched here:
--   * stock counts, transfers, location moves and part use: the functions in ownership_location_01_schema.sql
--     check the 'inventory' role (and ownership_location_03_lock_stock_writes.sql closes direct writes);
--   * part pictures and datasheets: the Storage policies in add_part_images.sql / add_part_datasheets.sql.
-- Changed here:
--   * parts (the Master List) and project_parts (each entity's Required Inventory list): reading stays open
--     to every active user, but inserting, updating and deleting now need the 'inventory' role.
--
-- The service role (the ticket system, the SQL editor) is not subject to these policies, as before.
-- The original write policies are saved first in public.security_policy_backup (if security_02 created it).

begin;

create or replace function public.is_inventory_editor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}'))
  );
$$;
revoke all on function public.is_inventory_editor() from public, anon;
grant execute on function public.is_inventory_editor() to authenticated, service_role;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['parts', 'project_parts'] loop
    -- every existing write policy goes (the read policy stays)
    for r in
      select * from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT'
    loop
      if to_regclass('public.security_policy_backup') is not null and r.policyname not like 'inventory %' then
        insert into public.security_policy_backup (schemaname, tablename, policyname, roles, cmd, qual, with_check)
        values (r.schemaname, r.tablename, r.policyname, array_to_string(r.roles, ','), r.cmd, r.qual, r.with_check)
        on conflict do nothing;
      end if;
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;

    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_inventory_editor())', 'inventory insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_inventory_editor()) with check (public.is_inventory_editor())', 'inventory update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_inventory_editor())', 'inventory delete', t);
  end loop;
end $$;

commit;
