-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT.
-- (If you already ran an earlier version of this file, run it again: it now also adds
-- the 'prepaid' parts status below. Everything in it is safe to repeat.)
--
-- Lets a parts PO be marked "pre-paid": the vendor is paid up front, so there is no
-- receipt to match its invoices to. On a pre-paid PO:
--   * an invoice can go straight to Invoice Approval without a receipt being matched;
--   * the PO's parts status becomes 'Pre-paid', which counts as done, so the PO can be
--     closed (once every invoice is approved and paid) without marking the parts Received.
--     Parts that are never marked Received are not added to stock.
--
--   prepaid  false (default) = the usual flow: invoice matched to a receipt, then approved.
--
-- Nothing changes for any existing PO.

alter table purchase_requests
  add column if not exists prepaid boolean not null default false;

-- Allow 'prepaid' as a parts status. The original check was written inline on the column,
-- so find it by what it checks rather than by name.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.purchase_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%parts_status%'
  loop
    execute format('alter table public.purchase_requests drop constraint %I', c.conname);
  end loop;
end $$;

alter table purchase_requests
  add constraint purchase_requests_parts_status_check
    check (parts_status in ('not_ordered', 'ordered', 'partially_received', 'received', 'prepaid'));
