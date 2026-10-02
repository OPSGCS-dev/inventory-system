-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Lets each user save a signature (a small PNG, stored as a data URL) that is
-- printed on the "Authorized by" line of every purchase order they approve.
-- Who approved and when is already recorded on the request
-- (approved_by / approved_at), so nothing else is needed.
--
-- Purely additive.

alter table users add column if not exists signature text;
