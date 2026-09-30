-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds an explicit PO category (Purchase / Service / Not to Exceed), separate
-- from a request's line-item type (part vs service). Purchase POs keep the
-- existing markup + shipping/handling fields; Service POs have neither; Not
-- to Exceed POs get a spending cap that's tracked against invoiced totals as
-- invoices come in. Purely additive -- no existing columns touched.

alter table purchase_requests
  add column if not exists po_category text not null default 'purchase';

alter table purchase_requests
  drop constraint if exists purchase_requests_po_category_check;

alter table purchase_requests
  add constraint purchase_requests_po_category_check
    check (po_category in ('purchase', 'service', 'not_to_exceed'));

alter table purchase_requests
  add column if not exists spending_cap numeric;
