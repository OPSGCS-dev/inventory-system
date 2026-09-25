-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Renames the role set on users.roles to the new additive model:
--   inventory_user -> inventory
--   regular        -> purchase_req
--   approver       -> approve
--   purchaser      -> approve   (Issue PO / vendor email is now folded into Approve)
--   admin          -> admin     (unchanged; admin now ONLY grants Admin-tab
--                                editing, not any other permission — go into
--                                the Admin tab afterward and tick whichever
--                                of Inventory / Purchase Req / Approve /
--                                Receive each admin user should also have)

update users
set roles = (
  select array_agg(distinct mapped)
  from unnest(roles) as r(old_role),
  lateral (
    select case old_role
      when 'inventory_user' then 'inventory'
      when 'regular' then 'purchase_req'
      when 'approver' then 'approve'
      when 'purchaser' then 'approve'
      else old_role
    end as mapped
  ) m
)
where roles is not null;
