-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Best run after add_po_history.sql (so the change shows up in PO History); it works without it.
--
-- "Vendor contacted" marker on a purchase order. It is set in two ways:
--   * automatically, when someone presses Email Vendor on an issued PO ('email'), and
--   * by hand, with a button on the PO, for a vendor contacted outside the site -- a phone call,
--     an email written in the email program, ... ('manual').
-- It can be cleared again. Who and when are stamped by the database, not the browser, and the
-- change is recorded in PO History like any other change to the PO.
--
-- POs that already exist start with no marker (not contacted).

alter table public.purchase_requests add column if not exists vendor_contacted_at timestamptz;
alter table public.purchase_requests add column if not exists vendor_contacted_by bigint references public.users(id);
alter table public.purchase_requests add column if not exists vendor_contacted_how text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_vendor_contacted_how_check') then
    alter table public.purchase_requests
      add constraint purchase_requests_vendor_contacted_how_check
      check (vendor_contacted_how is null or vendor_contacted_how in ('email', 'manual'));
  end if;
end $$;

create or replace function public.fn_vendor_contacted_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid bigint;
begin
  if new.vendor_contacted_at is null then
    -- cleared: nothing else is kept
    new.vendor_contacted_by := null;
    new.vendor_contacted_how := null;
  elsif old.vendor_contacted_at is distinct from new.vendor_contacted_at then
    -- newly marked: the time and the person are the database's, whatever the browser sent
    select u.id into uid from public.users u where u.auth_user_id = auth.uid() and u.active;
    new.vendor_contacted_at := now();
    new.vendor_contacted_by := uid;
    new.vendor_contacted_how := coalesce(new.vendor_contacted_how, 'manual');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_contacted_stamp on public.purchase_requests;
create trigger trg_vendor_contacted_stamp
  before update on public.purchase_requests
  for each row execute function public.fn_vendor_contacted_stamp();
