-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- The 'received' status is fully retired -- app code never produces it
-- anymore (superseded by the independent work_status/invoices tracking and
-- the explicit Close PO action). If any row is still sitting at
-- status = 'received' from earlier testing, update it to 'issued' (and set
-- work_status = 'complete', since that's what 'received' used to mean)
-- before running this, or the constraint below will reject it.

update purchase_requests set status = 'issued', work_status = 'complete' where status = 'received';

alter table purchase_requests drop constraint if exists purchase_requests_status_check;
alter table purchase_requests add constraint purchase_requests_status_check
  check (status in ('draft', 'submitted', 'approved', 'issued', 'closed'));
