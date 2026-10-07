-- Undo for security_04_lock_down_users_table.sql: removes the new policies and
-- trigger on users / user_role_entities and recreates the original policies
-- from public.security_users_policy_backup.

begin;

drop trigger if exists aa_users_guard_update on public.users;

do $$
declare r record;
begin
  for r in
    select * from pg_policies
    where schemaname = 'public' and tablename in ('users', 'user_role_entities')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in select * from public.security_users_policy_backup order by tablename, policyname loop
    execute format('create policy %I on %I.%I as %s for %s to %s',
                   r.policyname, r.schemaname, r.tablename, lower(coalesce(r.permissive, 'permissive')), r.cmd, r.roles)
      || case when r.qual is not null then ' using (' || r.qual || ')' else '' end
      || case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end;
  end loop;

  -- Emptied so a later re-run of script 04 takes a fresh backup.
  delete from public.security_users_policy_backup;
end $$;

commit;

-- Optional clean-up once you are sure you do not want this back:
--   drop function public.users_guard_update();
--   drop function public.is_app_admin();
--   drop table public.security_users_policy_backup;
