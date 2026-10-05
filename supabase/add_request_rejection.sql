-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Lets an approver reject a purchase request (with a reason) instead of only
-- approving it or putting it on hold. A rejected request keeps its history and
-- can be returned to draft by whoever submitted it, revised and submitted again.
--
-- Purely additive: adds the 'rejected' status and three columns.

alter table purchase_requests drop constraint if exists purchase_requests_status_check;
alter table purchase_requests add constraint purchase_requests_status_check
  check (status in ('draft', 'submitted', 'approved', 'issued', 'closed', 'rejected'));

alter table purchase_requests add column if not exists rejected_by bigint references users(id);
alter table purchase_requests add column if not exists rejected_at timestamptz;
alter table purchase_requests add column if not exists rejection_reason text;
