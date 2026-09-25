-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- "Last Cost" on each part: the last price paid, editable from the Master
-- List. Used to pre-fill the Unit Cost when a part is added to a purchase
-- request line. A constant DEFAULT on ADD COLUMN backfills every existing
-- row with that value, so this also sets all current parts to $250.

alter table parts add column if not exists last_cost numeric default 250;
