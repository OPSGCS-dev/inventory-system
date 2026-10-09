-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_vendor_approval.sql and add_vendor_approval_guard.sql. If you have not run
-- add_po_history.sql yet, run that after this; if you already have, run it again (it now has
-- "vendor deactivated / reactivated" events).
--
-- Vendors are deactivated, not deleted. A deactivated vendor stays on file with its history, and
-- every PO ever issued to it is untouched, but it can no longer be chosen for new requests, and
-- a request using it can't be approved nor its PO issued (the database enforces this, like it does
-- for vendors that are pending approval or rejected). Reactivating puts it back.
--
--   active              true (default) = usable
--   deactivated_by/_at  who turned it off, and when
--   deactivation_reason why (optional)
--
-- Every existing vendor stays active.

alter table vendors add column if not exists active boolean not null default true;
alter table vendors add column if not exists deactivated_by bigint references users(id);
alter table vendors add column if not exists deactivated_at timestamptz;
alter table vendors add column if not exists deactivation_reason text;

-- The same guard as before (approval status), plus: a deactivated vendor can't take a request into
-- 'approved' or 'issued'. Only the moment of change is checked, so POs already issued to a vendor
-- that is deactivated later carry on normally (invoices, receipts, payment, closing).
create or replace function public.fn_require_approved_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  entering boolean;
begin
  if new.vendor_id is null or new.status not in ('approved', 'issued') then
    return new;
  end if;

  entering := tg_op = 'INSERT'
    or new.status is distinct from old.status
    or new.vendor_id is distinct from old.vendor_id;
  if not entering then
    return new;
  end if;

  select name, approval_status, rejection_reason, active into v from vendors where id = new.vendor_id;
  if not found then
    raise exception 'The vendor on this request could not be found.' using errcode = 'P0001';
  end if;

  if coalesce(v.approval_status, 'approved') = 'pending' then
    raise exception '% is still pending approval as a vendor — it has to be approved before this request can be approved or its PO issued.', v.name
      using errcode = 'P0001';
  elsif v.approval_status = 'rejected' then
    raise exception '% was rejected as a vendor% — choose another vendor.', v.name,
      case when coalesce(v.rejection_reason, '') = '' then '' else ' (' || v.rejection_reason || ')' end
      using errcode = 'P0001';
  elsif not coalesce(v.active, true) then
    raise exception '% has been deactivated as a vendor — choose another vendor, or ask an admin to reactivate it.', v.name
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_require_approved_vendor on public.purchase_requests;
create trigger trg_require_approved_vendor
  before insert or update on public.purchase_requests
  for each row execute function public.fn_require_approved_vendor();
