-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT.
-- Needs add_vendor_approval.sql to have been run first (it adds vendors.approval_status).
--
-- Makes the database itself refuse to approve a purchase request, or issue its PO,
-- while its vendor is still 'pending' or was 'rejected'. Until now that rule only
-- lived in the browser (src/App.jsx), so anything that skipped it -- an old page left
-- open, a stale copy of the vendor, a direct update -- could push a PO through.
--
-- Only the moment of change is checked, so nothing that already exists is touched:
--   * a request moving INTO 'approved' or 'issued', or
--   * a request that is 'approved' / 'issued' having its vendor switched.
-- Later edits to an already-issued PO (invoices, receipts, status flags) are not
-- re-checked, and neither are closed transfer POs. A request with no vendor is left alone.
--
-- Safe to run again.

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

  select name, approval_status, rejection_reason into v from vendors where id = new.vendor_id;
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
  end if;

  return new;
end;
$$;

drop trigger if exists trg_require_approved_vendor on public.purchase_requests;
create trigger trg_require_approved_vendor
  before insert or update on public.purchase_requests
  for each row execute function public.fn_require_approved_vendor();
