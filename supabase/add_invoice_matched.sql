-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a third accounting-only checkbox, "Invoice Match", tracking who set it
-- and when. Sits before "Invoice Approved" in the workflow (match the invoice
-- to the PO, then approve it, then mark it paid) and is gated by the same
-- "Accounting" role.

alter table purchase_requests add column if not exists invoice_matched boolean not null default false;
alter table purchase_requests add column if not exists invoice_matched_by bigint references users(id);
alter table purchase_requests add column if not exists invoice_matched_at timestamptz;
