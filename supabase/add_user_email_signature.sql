-- Run this once in the Inventory project's Supabase SQL editor. Safe to repeat.
--
-- Lets each Purchaser save a rich-text (HTML) email signature, pasted from Outlook, which the app adds to the bottom
-- of the email to a vendor (Email Vendor on an issued PO). It is kept on the user's own row like the drawn signature
-- (users.signature) and, like it, each person can change only their own.
--
-- security_04_lock_down_users_table.sql made the users table refuse any change by a non-admin except the signature,
-- activated_at and updated_at columns. This adds email_signature to that short list. The function is only replaced
-- when that file has been run (when it hasn't, the table has no such guard and the new column simply works).

alter table users add column if not exists email_signature text;

do $do$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'users_guard_update'
  ) then
    execute $fn$
      create or replace function public.users_guard_update()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $body$
      begin
        if auth.uid() is not null and not public.is_app_admin() then
          if (to_jsonb(new) - 'signature' - 'email_signature' - 'activated_at' - 'updated_at')
             is distinct from
             (to_jsonb(old) - 'signature' - 'email_signature' - 'activated_at' - 'updated_at') then
            raise exception 'Only an admin can change a user''s roles, status, name or vendor link.'
              using errcode = '42501';
          end if;
        end if;
        return new;
      end;
      $body$
    $fn$;
    revoke all on function public.users_guard_update() from public, anon;
  end if;
end
$do$;
