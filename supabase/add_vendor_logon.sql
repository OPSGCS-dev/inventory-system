-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Lets a vendor log in and see only their own issued POs. Checking "Logon"
-- for a vendor (with a password set) auto-manages a matching row in `users`
-- behind the scenes — name = vendor's email, role = 'vendor', linked via
-- vendor_id. That user is hidden from the Admin > Users table (it's managed
-- from the Vendors table instead) and, once logged in:
--   - sees only the Purchase Orders tab
--   - sees only requests for their own vendor that are actually issued POs
--     (status 'issued' or 'received' — not drafts/requisitions/approvals)
--   - has no role that lets them create a request or change its status

alter table vendors add column if not exists logon_enabled boolean not null default false;
alter table vendors add column if not exists password text;
alter table users add column if not exists vendor_id bigint references vendors(id);
