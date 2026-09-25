-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Each project_parts row (a site's requirement for a part) needs to say
-- HOW that requirement is expected to be met:
--   'project' = the site needs its own dedicated unit on-site
--   'flops'   = FLOPS (central stores) is expected to cover it
--   'shared'  = acceptable to use a unit sitting at another project
--
-- The Target (total required) shown on Inventory On Hand only sums the
-- target_stock of 'project' rows — 'flops'/'shared' rows don't add to the
-- total because they're satisfied without needing their own dedicated unit.

alter table project_parts add column requirement_type text not null default 'project'
  check (requirement_type in ('project', 'flops', 'shared'));
