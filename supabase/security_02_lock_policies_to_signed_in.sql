-- Run this in the Supabase SQL editor (INVENTORY project).
--
-- Locks the inventory database to signed-in, active app users. Today every
-- table's "Allow public ..." policy is literally `true`, so anyone holding the
-- app's public key can read and change data without logging in. This rewrites
-- each such policy to require BOTH:
--   * a signed-in session (role `authenticated`, not `anon`), and
--   * a matching, active row in public.users (the same check the app already
--     does at login before it loads anything).
--
-- What does NOT change: every screen, because the app only reads or writes
-- after login. The ticket system and /api/invite-user use the service-role
-- key, which ignores RLS entirely. Policies keep their names and commands;
-- only who they apply to and the condition change.
--
-- Also covers Storage policies on the quotes / invoices / receipts buckets
-- (writes and listing now need a signed-in user). Public file links keep
-- working: public-bucket downloads don't go through these policies.
--
-- Safety net: the original definition of every policy it touches is saved to
-- public.security_policy_backup first, and security_02_rollback.sql restores
-- them exactly. The public-schema part runs as one block, so if anything
-- errors, nothing is changed. Safe to re-run.
--
-- AFTER RUNNING: log in as a normal user and a vendor logon, open each tab,
-- save a PO draft, upload a quote PDF. See the checklist in the chat.

begin;

-- 1. The check used by every rewritten policy. SECURITY DEFINER so it can read
--    public.users regardless of that table's own policies; search_path pinned.
create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.active
  );
$$;

revoke all on function public.is_active_app_user() from public;
grant execute on function public.is_active_app_user() to authenticated, service_role;

-- 2. Backup table for original policy definitions (RLS on, no policies: only
--    the database owner / service role can see it).
create table if not exists public.security_policy_backup (
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  roles text not null,
  cmd text not null,
  qual text,
  with_check text,
  backed_up_at timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public.security_policy_backup enable row level security;

-- 3. Back up, then rewrite, every open policy in the public schema.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
  n int := 0;
begin
  for r in
    select * from pg_policies
    where schemaname = 'public'
      and tablename <> 'security_policy_backup'
      and (qual = 'true' or with_check = 'true')
  loop
    insert into public.security_policy_backup (schemaname, tablename, policyname, roles, cmd, qual, with_check)
    values (r.schemaname, r.tablename, r.policyname, array_to_string(r.roles, ','), r.cmd, r.qual, r.with_check)
    on conflict do nothing;

    new_qual := case when r.qual is null then null else 'public.is_active_app_user()' end;
    new_check := case when r.with_check is null then null else 'public.is_active_app_user()' end;

    stmt := format('alter policy %I on %I.%I to authenticated', r.policyname, r.schemaname, r.tablename)
         || case when new_qual is not null then ' using (' || new_qual || ')' else '' end
         || case when new_check is not null then ' with check (' || new_check || ')' else '' end;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice 'public policies locked to signed-in active users: %', n;
end $$;

commit;

-- 4. Storage policies for the three PDF buckets. Separate from the block above
--    because storage.objects is owned by Supabase; if your role isn't allowed
--    to alter it, this part reports a NOTICE and skips instead of failing.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
  n int := 0;
begin
  for r in
    select * from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ~ '''(quotes|invoices|receipts)''' or coalesce(with_check, '') ~ '''(quotes|invoices|receipts)''')
      and coalesce(qual, '') not like '%is_active_app_user%'
      and coalesce(with_check, '') not like '%is_active_app_user%'
  loop
    begin
      insert into public.security_policy_backup (schemaname, tablename, policyname, roles, cmd, qual, with_check)
      values (r.schemaname, r.tablename, r.policyname, array_to_string(r.roles, ','), r.cmd, r.qual, r.with_check)
      on conflict do nothing;

      new_qual := case when r.qual is null then null else 'public.is_active_app_user() and (' || r.qual || ')' end;
      new_check := case when r.with_check is null then null else 'public.is_active_app_user() and (' || r.with_check || ')' end;

      stmt := format('alter policy %I on storage.objects to authenticated', r.policyname)
           || case when new_qual is not null then ' using (' || new_qual || ')' else '' end
           || case when new_check is not null then ' with check (' || new_check || ')' else '' end;
      execute stmt;
      n := n + 1;
    exception when others then
      raise notice 'skipped storage policy %: %', r.policyname, sqlerrm;
    end;
  end loop;
  raise notice 'storage policies locked: %', n;
end $$;
