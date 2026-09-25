-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Replaces the per-project "location" idea with a much simpler part-level
-- split: how many units of a part sit in Storage, how many sit in the Barn
-- — both entered directly. "Project" is not entered; it's the remainder
-- (Total On-Hand - Storage - Barn), i.e. Project is the plug.

alter table parts add column storage_qty integer not null default 0;
alter table parts add column barn_qty integer not null default 0;

-- Journal lines need to support part-level changes (no single project
-- involved, and no single before/after quantity — instead before/after
-- storage and barn counts).
alter table inventory_journal_lines alter column project_id drop not null;
alter table inventory_journal_lines alter column new_quantity drop not null;
alter table inventory_journal_lines add column previous_storage_qty integer;
alter table inventory_journal_lines add column new_storage_qty integer;
alter table inventory_journal_lines add column previous_barn_qty integer;
alter table inventory_journal_lines add column new_barn_qty integer;

-- The old per-project location column/constraint and its journal columns
-- are no longer used — replaced by the part-level split above.
alter table stock_on_hand drop constraint if exists stock_on_hand_location_check;
alter table stock_on_hand drop column if exists location;
alter table inventory_journal_lines drop column if exists previous_location;
alter table inventory_journal_lines drop column if exists new_location;
