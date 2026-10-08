-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT. Needs security_04_lock_down_users_table.sql to have run
-- first (it defines public.is_app_admin()).
--
-- Admin-editable settings. The first one is the per-unit cap on a consumable
-- on a purchase request (Admin > Settings in the app). It used to be a fixed
-- $1000 written into the app and into a table check; now the app reads it from
-- here, and the database enforces whatever it is set to.
--
--   Anyone signed in and active can read the settings; only an admin can change them.
--   Changing the cap does not touch consumable lines already saved: it applies to
--   lines saved from now on.

create table if not exists public.app_settings (
  key text primary key,
  value numeric not null check (value >= 0),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.users (id)
);

alter table public.app_settings enable row level security;

drop policy if exists "app settings read" on public.app_settings;
create policy "app settings read" on public.app_settings
  for select to authenticated using (public.is_active_app_user());

drop policy if exists "app settings insert admin" on public.app_settings;
create policy "app settings insert admin" on public.app_settings
  for insert to authenticated with check (public.is_app_admin());

drop policy if exists "app settings update admin" on public.app_settings;
create policy "app settings update admin" on public.app_settings
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

insert into public.app_settings (key, value) values ('consumable_max_unit_cost', 1000)
on conflict (key) do nothing;

-- The old fixed check (<= 1000) becomes a trigger that reads the setting.
alter table public.purchase_request_lines drop constraint if exists purchase_request_lines_consumable_cap;

create or replace function public.enforce_consumable_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare cap numeric;
begin
  if new.inventory_action = 'consumable' and new.unit_cost is not null then
    select value into cap from public.app_settings where key = 'consumable_max_unit_cost';
    cap := coalesce(cap, 1000);
    if new.unit_cost > cap then
      raise exception 'A consumable can''t cost more than $% each (the limit set under Admin > Settings).', cap
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_consumable_cap() from public, anon;

drop trigger if exists purchase_request_lines_consumable_cap on public.purchase_request_lines;
create trigger purchase_request_lines_consumable_cap
  before insert or update of unit_cost, inventory_action on public.purchase_request_lines
  for each row execute function public.enforce_consumable_cap();
