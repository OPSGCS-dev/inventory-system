-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Replaces hard-deleting a purchase request (past draft) with voiding it, so
-- the PO row, its activity log and anything accounting already saw stay on
-- file. A voided PO keeps its PO number (numbers are never reused anyway --
-- see po_number_sequences) and shows as "Voided" everywhere.
--
-- Purely additive: adds the 'voided' status and three columns.

alter table purchase_requests drop constraint if exists purchase_requests_status_check;
alter table purchase_requests add constraint purchase_requests_status_check
  check (status in ('draft', 'submitted', 'approved', 'issued', 'closed', 'rejected', 'voided'));

alter table purchase_requests add column if not exists voided_by bigint references users(id);
alter table purchase_requests add column if not exists voided_at timestamptz;
alter table purchase_requests add column if not exists void_reason text;
