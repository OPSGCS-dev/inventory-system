-- Run this in the Supabase SQL editor (INVENTORY project).
--
-- Closes the privilege-escalation hole on the users table. Today any signed-in
-- account (a vendor logon included) can update ANY row in public.users straight
-- through the API, including its own `roles` -- the screens hide this, the
-- database doesn't. After this script:
--
--   public.users
--     read   any active app user, plus your own row always
--     insert admin only (the app creates people through /api/invite-user, which
--            uses the service role and is unaffected)
--     update admin: anything. Everyone else: ONLY their own row, and ONLY the
--            signature and activated_at columns (a trigger rejects any change to
--            roles, active, vendor_id, name, auth_user_id, display_name, ...)
--     delete admin only
--
--   public.user_role_entities (which entities a role is limited to)
--     read   any active app user
--     write  admin only (otherwise anyone could delete their own limits, and a
--            role with no limits means "every entity")
--
-- It also removes every other policy on those two tables first (they are
-- OR-ed together, so one leftover permissive policy would undo all of this),
-- after saving them to public.security_users_policy_backup.
--
-- What does not change: the Users tab for admins, invite/vendor logons, change
-- password, saving a signature, and the password-setup link. The ticket system
-- and /api/invite-user use the service role, which bypasses all of this.
--
-- To undo: run security_04_rollback.sql.

begin;

-- 1. Admin check (same pattern as is_active_app_user).
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.active and 'admin' = any (u.roles)
  );
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated, service_role;

-- 2. Save every existing policy on the two tables, then drop them.
create table if not exists public.security_users_policy_backup (
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  permissive text,
  roles text not null,
  cmd text not null,
  qual text,
  with_check text,
  backed_up_at timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public.security_users_policy_backup enable row level security;

do $$
declare
  r record;
  already_backed_up boolean := exists (select 1 from public.security_users_policy_backup);
begin
  for r in
    select * from pg_policies
    where schemaname = 'public' and tablename in ('users', 'user_role_entities')
  loop
    -- Only the first run saves anything: on a re-run the policies here are
    -- this script's own, and must not overwrite the originals in the backup.
    if not already_backed_up then
      insert into public.security_users_policy_backup
        (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
      values (r.schemaname, r.tablename, r.policyname, r.permissive, array_to_string(r.roles, ','), r.cmd, r.qual, r.with_check);
    end if;
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.users enable row level security;
alter table public.user_role_entities enable row level security;

-- 3. users policies.
create policy "users read" on public.users for select to authenticated
  using (auth_user_id = auth.uid() or public.is_active_app_user());

create policy "users insert admin" on public.users for insert to authenticated
  with check (public.is_app_admin());

create policy "users update admin or self" on public.users for update to authenticated
  using (public.is_app_admin() or auth_user_id = auth.uid())
  with check (public.is_app_admin() or auth_user_id = auth.uid());

create policy "users delete admin" on public.users for delete to authenticated
  using (public.is_app_admin());

-- 4. Non-admins may only change signature / activated_at on their own row.
--    Written as "everything except those columns must be unchanged" so any
--    column added later is protected by default. Skipped when there is no
--    signed-in user (service role, SQL editor). Named aa_ so it fires before
--    any other BEFORE UPDATE trigger touches the row.
create or replace function public.users_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_app_admin() then
    if (to_jsonb(new) - 'signature' - 'activated_at' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'signature' - 'activated_at' - 'updated_at') then
      raise exception 'Only an admin can change a user''s roles, status, name or vendor link.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.users_guard_update() from public, anon;

drop trigger if exists aa_users_guard_update on public.users;
create trigger aa_users_guard_update
  before update on public.users
  for each row execute function public.users_guard_update();

-- 5. user_role_entities policies.
create policy "role entities read" on public.user_role_entities for select to authenticated
  using (public.is_active_app_user());
create policy "role entities insert admin" on public.user_role_entities for insert to authenticated
  with check (public.is_app_admin());
create policy "role entities update admin" on public.user_role_entities for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
create policy "role entities delete admin" on public.user_role_entities for delete to authenticated
  using (public.is_app_admin());

commit;
