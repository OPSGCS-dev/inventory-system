-- Run this once in the Supabase SQL editor.
-- Adds per-project required-parts sheets: a project has a list of required
-- parts, each with its own "shared" flag, minimum stock level, and reorder
-- quantity. Stock-on-hand quantities are intentionally NOT included here —
-- that's a later phase.
--
-- NOTE: "projects" and "project_parts" tables already existed in this
-- project (leftovers from an earlier first attempt) but were confirmed
-- empty (0 rows each) via the REST API before this drop, so no data is lost.

drop table if exists project_parts cascade;
drop table if exists projects cascade;

create table projects (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table project_parts (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  part_gcs_id integer not null references parts (gcs_id) on delete cascade,
  shared boolean not null default false,
  min_stock integer,
  reorder_qty integer,
  created_at timestamptz not null default now(),
  unique (project_id, part_gcs_id)
);

alter table projects enable row level security;
alter table project_parts enable row level security;

-- Permissive policies for now, matching the "parts" table setup.
create policy "Allow public read" on projects for select using (true);
create policy "Allow public insert" on projects for insert with check (true);
create policy "Allow public update" on projects for update using (true);
create policy "Allow public delete" on projects for delete using (true);

create policy "Allow public read" on project_parts for select using (true);
create policy "Allow public insert" on project_parts for insert with check (true);
create policy "Allow public update" on project_parts for update using (true);
create policy "Allow public delete" on project_parts for delete using (true);

-- Seed the current projects. More can be added later the same way (either
-- another INSERT here, or through the app once project management exists).
insert into projects (name) values
  ('SunEd Norfolk LP'),
  ('SunE Hwy 2S'),
  ('SunE Odessa')
on conflict (name) do nothing;
