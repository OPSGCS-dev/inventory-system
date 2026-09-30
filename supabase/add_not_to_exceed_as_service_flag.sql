-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Not to Exceed is now a checkbox on a Service PO, not its own category --
-- selecting Service shows a "Not to Exceed" checkbox that reveals the
-- Spending Cap field, rather than a third item in the category dropdown.
-- Any existing row already saved with po_category = 'not_to_exceed' is
-- converted to category 'service' with the new flag set, so nothing already
-- in the system is left pointing at a category value the app no longer
-- writes or recognizes.

alter table purchase_requests
  add column if not exists not_to_exceed boolean not null default false;

update purchase_requests
set po_category = 'service',
    not_to_exceed = true
where po_category = 'not_to_exceed';

alter table purchase_requests
  drop constraint if exists purchase_requests_po_category_check;

alter table purchase_requests
  add constraint purchase_requests_po_category_check
    check (po_category in ('purchase', 'service'));
