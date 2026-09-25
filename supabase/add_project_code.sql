-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a 2-digit project code used to auto-generate PO numbers in the form
-- {project_code}-{2-digit year}-{3-digit sequence}, e.g. "06-26-001" for the
-- 1st PO issued in 2026 for the project coded "06". The sequence resets
-- automatically each year (it's derived from existing PO numbers, not a
-- separate counter) and counts independently per project.
--
-- Existing projects are auto-numbered 01, 02, 03... in name order as a
-- starting point -- adjust any of them in the app's Users tab (Admin only)
-- if you want a specific project to have a specific code.

alter table projects add column if not exists project_code text;

with numbered as (
  select id, lpad(row_number() over (order by name)::text, 2, '0') as code
  from projects
)
update projects p
set project_code = numbered.code
from numbered
where p.id = numbered.id and p.project_code is null;
