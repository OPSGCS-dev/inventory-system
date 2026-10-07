-- Undo for security_02_lock_policies_to_signed_in.sql.
-- Restores every policy it changed to its exact original definition, from
-- public.security_policy_backup. Run this immediately if anything stops working
-- after the lock-down; then tell me what broke.

do $$
declare
  r record;
  stmt text;
  n int := 0;
begin
  for r in select * from public.security_policy_backup order by schemaname, tablename, policyname loop
    begin
      stmt := format('alter policy %I on %I.%I to %s', r.policyname, r.schemaname, r.tablename, r.roles)
           || case when r.qual is not null then ' using (' || r.qual || ')' else '' end
           || case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end;
      execute stmt;
      n := n + 1;
    exception when others then
      raise notice 'could not restore %.% "%": %', r.schemaname, r.tablename, r.policyname, sqlerrm;
    end;
  end loop;
  raise notice 'policies restored: %', n;
end $$;

-- Optional, after you're sure you want the lock-down gone for good:
--   drop table public.security_policy_backup;
--   drop function public.is_active_app_user();
