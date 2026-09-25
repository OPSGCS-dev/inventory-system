-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- A short, purpose-built one-line description shown on the Purchase Orders
-- summary list (separate from the existing free-text "Notes" field), so
-- requests can be told apart at a glance without opening each one.

alter table purchase_requests add column if not exists description text;
