-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds two accounting-only checkboxes to a purchase request: "Invoice
-- Approved" and "Paid", each tracking who set it and when. Both are gated
-- by a new "Accounting" role (additive, like every other role in this app)
-- and only apply once a PO has actually been issued.

alter table purchase_requests add column if not exists invoice_approved boolean not null default false;
alter table purchase_requests add column if not exists invoice_approved_by bigint references users(id);
alter table purchase_requests add column if not exists invoice_approved_at timestamptz;

alter table purchase_requests add column if not exists paid boolean not null default false;
alter table purchase_requests add column if not exists paid_by bigint references users(id);
alter table purchase_requests add column if not exists paid_at timestamptz;
