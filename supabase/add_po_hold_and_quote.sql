-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds an on-hold overlay for a submitted request (an alternative to
-- approving it, not a new status -- same pattern as work_status/
-- payment_status sitting alongside the real status column) and a single
-- quote-file attachment per purchase request. Purely additive.

alter table purchase_requests
  add column if not exists on_hold boolean not null default false;

alter table purchase_requests
  add column if not exists hold_reason text;

alter table purchase_requests
  add column if not exists held_by bigint references users(id);

alter table purchase_requests
  add column if not exists held_at timestamptz;

alter table purchase_requests
  add column if not exists quote_file_url text;

alter table purchase_requests
  add column if not exists quote_file_name text;

-- Also needed (outside this file, via the Supabase dashboard): a "quotes"
-- Storage bucket, set Public, the same way the existing "invoices" and
-- "receipts" buckets are configured -- Storage buckets aren't scriptable
-- from here.
