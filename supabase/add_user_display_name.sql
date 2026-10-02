-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Gives each user a friendly name to show instead of their email. users.name
-- stays exactly as it is -- it IS the login email, and sign-in and the
-- ticket system both match on it -- so the friendly name lives in its own
-- column. Anyone without one keeps showing their email.
--
-- Purely additive.

alter table users add column if not exists display_name text;
