-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds the fields needed to print a formal Purchase Order document (matching
-- the company's existing PO template): whether the expense is chargeable,
-- a vendor quote number, and the cost breakdown (mark-up on parts, sales
-- tax, shipping/handling, a credit, and the currency). Budget Category is
-- intentionally left out for now.

alter table purchase_requests add column if not exists chargeable_expense boolean not null default false;
alter table purchase_requests add column if not exists vendor_quote_number text;
alter table purchase_requests add column if not exists markup_rate numeric not null default 10;
alter table purchase_requests add column if not exists tax_rate numeric not null default 13;
alter table purchase_requests add column if not exists shipping_handling numeric not null default 0;
alter table purchase_requests add column if not exists credit numeric not null default 0;
alter table purchase_requests add column if not exists currency text not null default 'CAD';
