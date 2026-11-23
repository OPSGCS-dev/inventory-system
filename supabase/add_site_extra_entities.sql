-- Run this once in the Inventory project's Supabase SQL editor (any time after add_sub_projects.sql).
--
-- A Site (sub_projects row) belongs to one Entity (project_id) but can now also be offered to other entities on the
-- PO form: sub_projects.also_project_ids holds the ids of those other entities. This is how Firelight Operations LP
-- (FLOPS) gets every rooftop and ground-mount site as a Site choice. Set it in Admin > Sites ("Also available to",
-- or "Make every site available to ..." to do all of them at once, then Save).
--
-- Nothing else changes: a PO still stores its own entity (project_id) and the site (sub_project_id) as before.
-- Until this is run the Admin controls are hidden and each entity offers only its own sites.

alter table sub_projects
  add column if not exists also_project_ids bigint[] not null default '{}';

notify pgrst, 'reload schema';
