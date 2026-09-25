-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Moves login from the old plaintext-password check (client-side, comparing
-- users.password in the browser) onto real Supabase Auth. users.id stays the
-- bigint it's always been (every FK in this schema points at it -- requested_by,
-- approved_by, etc. -- so nothing else changes), and a new auth_user_id column
-- links each row to its real auth.users account.
--
-- This migrates the existing active users' CURRENT passwords straight into
-- Supabase Auth (same password, no disruption) -- done here in SQL, not via
-- the app or any script, so the plaintext values never leave this database.

create extension if not exists pgcrypto;

alter table users add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;
alter table vendors drop column if exists password;

do $$
declare
  u record;
  new_id uuid;
begin
  for u in
    select id, name, password
    from users
    where active = true
      and auth_user_id is null
      and password is not null
      and name like '%@%'  -- name must be a real email for auth.users
  loop
    new_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_id,
      'authenticated',
      'authenticated',
      lower(u.name),
      crypt(u.password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      new_id::text,
      new_id,
      jsonb_build_object('sub', new_id::text, 'email', lower(u.name)),
      'email',
      now(), now(), now()
    );

    update users set auth_user_id = new_id, password = null where id = u.id;
  end loop;
end $$;

-- RLS: previously wide open to the public/anon key (see add_purchase_orders.sql) --
-- now requires a real signed-in session, matching how the rest of this app
-- gates access client-side. Not a full per-role rewrite (every other table
-- here is still anon-open) -- just closing the one table that used to hold
-- plaintext passwords.
drop policy if exists "Allow public read" on users;
drop policy if exists "Allow public insert" on users;
drop policy if exists "Allow public update" on users;
drop policy if exists "Allow public delete" on users;

create policy "Authenticated read" on users for select using (auth.role() = 'authenticated');
create policy "Authenticated insert" on users for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update" on users for update using (auth.role() = 'authenticated');
create policy "Authenticated delete" on users for delete using (auth.role() = 'authenticated');

-- Sanity check -- should show all 4 existing active users now linked, with
-- their password column cleared.
select id, name, auth_user_id, password, roles from users where active = true;
