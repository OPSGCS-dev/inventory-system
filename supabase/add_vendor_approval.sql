-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT (the one the inventory app uses, not the ticket system's).
--
-- Lets anyone who can create purchase requests ask for a new vendor, which is
-- then approved (or rejected) by someone holding the new 'vendor_approval' role.
--
--   approval_status  'pending'  = requested, not yet reviewed. Can be picked on
--                               a draft rec, but the rec can't be approved and
--                               its PO can't be issued until the vendor is.
--                    'approved' = a normal, usable vendor.
--                    'rejected' = turned down (rejection_reason says why).
--
-- Every vendor that exists today -- and every vendor an admin adds from
-- Admin > Vendors -- is 'approved' (the column default), so nothing changes
-- for them. Only vendors requested through a purchase request start 'pending'.

alter table vendors
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected'));

alter table vendors add column if not exists requested_by bigint references users(id);
alter table vendors add column if not exists requested_at timestamptz;
alter table vendors add column if not exists reviewed_by bigint references users(id);
alter table vendors add column if not exists reviewed_at timestamptz;
alter table vendors add column if not exists rejection_reason text;
