-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Payment Status becomes a manual field, same shape as work_status, rather
-- than something derived automatically from invoice amounts -- closing a PO
-- is now gated on the actual receipts/invoices records being matched,
-- approved, and paid (see canClosePo/allInvoicesFullyResolved in
-- src/utils.js), not on this label.

alter table purchase_requests add column if not exists payment_status text
  not null default 'unpaid'
  check (payment_status in ('unpaid', 'partial', 'paid'));
