-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Purchase orders can now mix part lines and service lines, so the PO
-- Category (Purchase / Service) goes away and the two kinds of work are
-- tracked separately on a PO.
--
-- 1. How a part line relates to inventory (purchase_request_lines.inventory_action):
--      spare             a part from the entity's inventory list that is kept
--                        as a spare: receiving the PO adds it to stock.
--      used_immediately  a part from the entity's list that is used straight
--                        away (e.g. in the service on the same PO): never added.
--      consumable        not an inventory part at all, never tracked. Free
--                        text (no master-list link) and at most $1000 a unit.
--    The older add_existing / add_new / not_tracked values stay allowed so
--    nothing already saved breaks, but nothing creates them any more -- parts
--    are no longer added to inventory from a PO.
--
-- 2. Separate progress markers: parts_status (ordering/receiving) and
--    service_status (doing the work). Existing POs carry over whichever one
--    their old single "PO Status" meant.
--
-- The old po_category and work_status columns are left in place (unused).

-- --- part lines --------------------------------------------------------------

alter table purchase_request_lines
  drop constraint if exists purchase_request_lines_inventory_action_check;

alter table purchase_request_lines
  add constraint purchase_request_lines_inventory_action_check
    check (inventory_action in (
      'spare', 'used_immediately', 'consumable',
      'add_existing', 'add_new', 'not_tracked'
    ));

-- A part already on the entity's list used to be a line with no action; say
-- so explicitly now. (add_existing was also linked to a master-list part.)
update purchase_request_lines
set inventory_action = 'spare'
where line_type = 'part'
  and part_gcs_id is not null
  and (inventory_action is null or inventory_action = 'add_existing');

alter table purchase_request_lines
  drop constraint if exists purchase_request_lines_consumable_cap;

alter table purchase_request_lines
  add constraint purchase_request_lines_consumable_cap
    check (inventory_action is distinct from 'consumable' or unit_cost is null or unit_cost <= 1000);

-- --- progress markers --------------------------------------------------------

alter table purchase_requests add column if not exists parts_status text
  check (parts_status in ('not_ordered', 'ordered', 'partially_received', 'received'));
alter table purchase_requests add column if not exists service_status text
  check (service_status in ('not_started', 'partial', 'complete'));
alter table purchase_requests add column if not exists service_completed_by bigint references users(id);
alter table purchase_requests add column if not exists service_completed_at timestamptz;

-- A Purchase PO's old status was its parts status; a Service PO's was its
-- service status (and received_by/at was who finished it).
update purchase_requests
set parts_status = work_status
where parts_status is null
  and coalesce(po_category, 'purchase') = 'purchase'
  and work_status in ('not_ordered', 'ordered', 'partially_received', 'received');

update purchase_requests
set service_status = work_status
where service_status is null
  and po_category = 'service'
  and work_status in ('not_started', 'partial', 'complete');

update purchase_requests
set service_completed_by = received_by,
    service_completed_at = received_at
where po_category = 'service'
  and service_completed_at is null
  and received_at is not null;
