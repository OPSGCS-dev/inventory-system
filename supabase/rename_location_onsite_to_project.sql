-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Renames the "On-Site" location bucket to "Project" (an asset physically
-- at its owning project's site), matching the Inventory On Hand grid's new
-- Project / Storage / Barn columns.

update stock_on_hand set location = 'Project' where location = 'On-Site';

alter table stock_on_hand drop constraint if exists stock_on_hand_location_check;
alter table stock_on_hand add constraint stock_on_hand_location_check
  check (location in ('Project', 'Storage', 'Barn'));
