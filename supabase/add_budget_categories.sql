-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Budget categories for Purchase Requests, managed from the Admin tab and
-- selected from a dropdown when a PO is created. "Planned Initiatives" is
-- the one category that has its own sub-category list (see
-- budget_subcategories) -- any category can have sub-categories, but only
-- Planned Initiatives has any seeded right now.
--
-- Seeded from "2026 O&M Budget" tab, column B of
-- "Copy of 1. OM POs - FMReport_July 21 - JP.xlsx".
--
-- Per-project budget amounts are a later step -- this is just the category
-- list + linking it to a purchase request.

create table budget_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table budget_subcategories (
  id bigint generated always as identity primary key,
  category_id bigint not null references budget_categories(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table purchase_requests add column if not exists budget_category_id bigint references budget_categories(id);
alter table purchase_requests add column if not exists budget_subcategory_id bigint references budget_subcategories(id);

alter table budget_categories enable row level security;
alter table budget_subcategories enable row level security;

create policy "Allow public read" on budget_categories for select using (true);
create policy "Allow public insert" on budget_categories for insert with check (true);
create policy "Allow public update" on budget_categories for update using (true);
create policy "Allow public delete" on budget_categories for delete using (true);

create policy "Allow public read" on budget_subcategories for select using (true);
create policy "Allow public insert" on budget_subcategories for insert with check (true);
create policy "Allow public update" on budget_subcategories for update using (true);
create policy "Allow public delete" on budget_subcategories for delete using (true);

insert into budget_categories (name) values
  ('FLOPS O&M Budget'),
  ('MMR Request'),
  ('Tracker Parts Replenishment'),
  ('O&M Consumables'),
  ('HV Spares Replenishment'),
  ('Unplanned / Out-of-Scope Maintenance'),
  ('Spares Parts Replenishment'),
  ('Other Misc.'),
  ('Planned Initiatives');

insert into budget_subcategories (category_id, name)
select (select id from budget_categories where name = 'Planned Initiatives'), sub.name
from (values
  ('Procurement of On-Site Generator'),
  ('Disposal/Bins'),
  ('VPN Router upgrade'),
  ('Upgrade Server'),
  ('Fence Repairs and Improvements'),
  ('Pest Control: Clusterfly & Wasp Spray'),
  ('Procurement of Fire Extinguishers'),
  ('Additional PTZ Camera for Site View'),
  ('Extending Tx valves for oil testing'),
  ('Switchgear bus bar covers'),
  ('PLC Repair / Beckhoff'),
  ('MC4 Repair Budget'),
  ('Greasing of Knuckles'),
  ('Annual Civil Maintenance'),
  ('Access Issue: I-house Keys / Locksmith'),
  ('Kirk Key Repairs'),
  ('Pile Repair Maintenance'),
  ('PLC Upgrade / Installation of Fans'),
  ('Fan / Ventillation Improvements'),
  ('Pro-active Modem Replacement'),
  ('Wind Deflector Repair'),
  ('Snow Camera'),
  ('AEI Communication Module Replacement'),
  ('Snow Clearing (North Area - Loblaw Sites)'),
  ('Transformer Spare'),
  ('Weather Station Replacement'),
  ('Monitoring Platform Transition')
) as sub(name);
