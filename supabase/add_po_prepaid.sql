-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT.
--
-- Lets a parts PO be marked "pre-paid": the vendor is paid up front, so there is no
-- receipt to match its invoices to. On a pre-paid PO an invoice can go straight to
-- Invoice Approval without a receipt being matched, and the PO can be closed without
-- every invoice having a receipt (the parts still have to be received, and every
-- invoice still has to be approved and paid).
--
--   prepaid  false (default) = the usual flow: invoice matched to a receipt, then approved.
--
-- Nothing changes for any existing PO. Safe to run again.

alter table purchase_requests
  add column if not exists prepaid boolean not null default false;
