-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Cleanup only: the "shared" column already exists and is populated
-- correctly (the earlier migration got partway through and stopped before
-- this last step). This just removes the old, now-unused column.

alter table project_parts drop column requirement_type;
