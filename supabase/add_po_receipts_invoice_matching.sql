-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Follow-up to add_po_invoice_overhaul.sql. Splits "confirming receipt" into
-- its own repeatable `receipts` table (multiple receipts per PO, uploaded by
-- the requisitioner independently of accounting's invoices) and adds a
-- pairing between an invoice and the receipt it corresponds to:
--
--   Accounting uploads an invoice \
--                                   -> Accounting pairs (matches) them -> the
--   Requisitioner uploads a receipt /    PO's original approver approves the
--                                        pair -> accounting marks it paid.
--
-- These two uploads happen independently/in parallel -- neither blocks the
-- other. Stock-on-hand is NOT affected by receipts here; that stays tied to
-- the existing Work Status "Complete" action (handleUploadReceiptAndConfirm
-- in src/App.jsx), which is unchanged. This table is purely the accounting
-- reconciliation trail.

create table if not exists receipts (
  id bigint generated always as identity primary key,
  purchase_request_id bigint not null references purchase_requests(id) on delete cascade,
  file_url text,
  file_name text,
  uploaded_by bigint references users(id),
  uploaded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists receipts_purchase_request_id_idx on receipts(purchase_request_id);

alter table receipts enable row level security;

create policy "Allow public read" on receipts for select using (true);
create policy "Allow public insert" on receipts for insert with check (true);
create policy "Allow public update" on receipts for update using (true);
create policy "Allow public delete" on receipts for delete using (true);

-- Pairing lives on the invoice side. A receipt can be matched to at most one
-- invoice (enforced by the unique index below, which ignores nulls, so any
-- number of invoices can stay unmatched at once).
alter table invoices add column if not exists matched_receipt_id bigint references receipts(id) on delete set null;

create unique index if not exists invoices_matched_receipt_id_unique
  on invoices(matched_receipt_id)
  where matched_receipt_id is not null;
