-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a per-user login (name + password) that gates the whole app, replacing
-- the single shared site password. This is a lightweight, prototype-tier
-- login to match everything else in this project: the app is a static page
-- talking directly to Supabase with the public/anon key, so a password
-- typed here is checked client-side, the same way the existing shared
-- "inventory password" already works. It is NOT hardened, bank-grade auth --
-- fine for a trusted internal tool, not for anything public-facing.
--
-- The five roles a user's account can hold (any combination):
--   admin          - full access; can manage Users, Vendors, and Projects
--   inventory_user - can edit Master List / Inventory Adjustment / Update
--                    Location (still requires the separate inventory
--                    password to actually save, same as today)
--   regular        - can view inventory (read-only) and create/submit
--                    purchase requisitions
--   approver       - regular, plus sees requisitions awaiting their approval
--   purchaser      - sees approved requisitions, issues the PO number, and
--                    can print / email it to the vendor
--
-- The existing "roles" values from the first Purchase Orders pass
-- ('requester', 'po_issuer') are renamed here to 'regular' / 'purchaser'.

alter table users add column if not exists password text;

-- Rename old role names to the new vocabulary on any existing rows.
update users set roles = array_replace(roles, 'requester', 'regular');
update users set roles = array_replace(roles, 'po_issuer', 'purchaser');
