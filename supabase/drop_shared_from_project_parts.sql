-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Required parts no longer carry an ownership/status flag. A project_parts
-- row just means "this project requires this part, in this quantity"
-- (project_id, part_gcs_id, target_stock). Ownership/availability is now
-- worked out from the stock_on_hand audit snapshot instead (see the
-- Availability Report).

alter table project_parts drop column shared;
