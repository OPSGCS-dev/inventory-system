-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Overhauls the Purchase Order workflow:
--
--   Draft -> Submitted -> Approved -> PO Issued -> (work + invoices) -> Closed
--
-- Replaces the old single-invoice bolt-on (invoice_matched/invoice_approved/
-- paid + one PDF) with a proper `invoices` table supporting multiple
-- invoices per PO, going forward. Adds an independent `work_status`
-- (not_started / partial / complete) tracking physical completion separately
-- from payment status (which is derived from the invoices table, not
-- stored). A PO can only be closed once work is complete and every invoice
-- is paid in full.
--
-- This migration is purely additive -- it does not drop the old
-- invoice_matched/invoice_approved/paid/invoice_file_url/invoice_file_name
-- columns or touch any existing rows. The app code stops reading/writing
-- them from here on (see src/utils.js and src/App.jsx), so they're simply
-- unused after this ships; drop them later in a follow-up migration once
-- you're ready to clear out any old test data by hand in the Supabase Table
-- Editor / SQL editor yourself.

alter table purchase_requests drop constraint if exists purchase_requests_status_check;
alter table purchase_requests add constraint purchase_requests_status_check
  check (status in ('draft', 'submitted', 'approved', 'issued', 'received', 'closed'));

alter table purchase_requests add column if not exists work_status text
  not null default 'not_started'
  check (work_status in ('not_started', 'partial', 'complete'));

alter table purchase_requests add column if not exists closed_by bigint references users(id);
alter table purchase_requests add column if not exists closed_at timestamptz;

-- receipt_file_url/name already exist live (used for work-complete evidence)
-- but were never captured in a tracked migration file -- add them here so
-- the migration history matches reality.
alter table purchase_requests add column if not exists receipt_file_url text;
alter table purchase_requests add column if not exists receipt_file_name text;

create table if not exists invoices (
  id bigint generated always as identity primary key,
  purchase_request_id bigint not null references purchase_requests(id) on delete cascade,
  invoice_number text,
  amount numeric not null,
  file_url text,
  file_name text,
  uploaded_by bigint references users(id),
  uploaded_at timestamptz not null default now(),
  approved boolean not null default false,
  approved_by bigint references users(id),
  approved_at timestamptz,
  paid boolean not null default false,
  paid_by bigint references users(id),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoices_purchase_request_id_idx on invoices(purchase_request_id);

alter table invoices enable row level security;

-- Permissive policies for now, matching every other table in this project.
create policy "Allow public read" on invoices for select using (true);
create policy "Allow public insert" on invoices for insert with check (true);
create policy "Allow public update" on invoices for update using (true);
create policy "Allow public delete" on invoices for delete using (true);
