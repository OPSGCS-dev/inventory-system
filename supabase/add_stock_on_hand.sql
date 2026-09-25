-- Run this once in the Supabase SQL editor.
-- Tracks current on-hand quantity per project + part, independent of the
-- "required" list in project_parts (a part could have stock on hand even
-- if it's not formally required, or vice versa). A later phase will add an
-- inventory_audits table that logs count events against this table over
-- time — keeping this table as just "current quantity" now keeps that
-- addition simple.

create table if not exists stock_on_hand (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  part_gcs_id integer not null references parts (gcs_id) on delete cascade,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (project_id, part_gcs_id)
);

alter table stock_on_hand enable row level security;

create policy "Allow public read" on stock_on_hand for select using (true);
create policy "Allow public insert" on stock_on_hand for insert with check (true);
create policy "Allow public update" on stock_on_hand for update using (true);
create policy "Allow public delete" on stock_on_hand for delete using (true);
