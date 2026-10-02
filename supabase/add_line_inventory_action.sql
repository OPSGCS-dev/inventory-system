-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Lets a part line on a Purchase PO be for something that isn't (yet) on the
-- entity's Required Inventory list, without letting anyone skip the inventory
-- counters by accident. Every part line now says how it relates to inventory:
--
--   (null)        a part already on the entity's list -- how every line worked
--                 before this, and still the normal case. Receiving the PO
--                 adds its quantity to that entity's stock.
--   add_existing  a master-list part that is NOT on this entity's list yet.
--                 Approving the request adds it to the entity's list.
--   add_new       a part that isn't in the master list at all. vendor_part_number
--                 + new_part_name describe it; approving the request creates the
--                 master-list part, adds it to the entity's list and links this
--                 line to it (part_gcs_id), so receiving counts it as usual.
--   not_tracked   a consumable / one-off that should not be counted. Needs a
--                 reason, never touches stock, and is flagged to the approver.
--
-- Purely additive: existing rows keep inventory_action = null and behave
-- exactly as before.

alter table purchase_request_lines
  add column if not exists inventory_action text
    check (inventory_action in ('add_existing', 'add_new', 'not_tracked'));

alter table purchase_request_lines add column if not exists vendor_part_number text;
alter table purchase_request_lines add column if not exists new_part_name text;
alter table purchase_request_lines add column if not exists not_tracked_reason text;
