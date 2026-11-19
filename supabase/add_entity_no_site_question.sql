-- Run this once in the Inventory project's Supabase SQL editor (any time after add_sub_projects.sql).
--
-- A ground-mount entity (SunE Ray LP, SunE South Stormont LP ...) is one site, but it may still have a row in the
-- Sites list (sub_projects) with a name that doesn't look like the entity's ("Newboro 1 (Ray)", "Bruining/South
-- Stormont"), and the PO form then asks which site the PO is for. This adds a setting on the entity,
-- "No site question on POs", that switches that question off for good, whatever its site rows are called.
-- Admin > Entities shows it as a tick box (only once this file has been run).
--
-- Entities that have exactly one site row are ticked here to start with (that is a ground mount; Firelight Solar LP's
-- rooftops are several). Untick or tick any of them under Admin > Entities afterwards.

alter table projects add column if not exists po_no_site boolean not null default false;

do $$
declare
  r record;
begin
  for r in
    select p.id, p.name
      from projects p
     where p.po_no_site = false
       and p.name not ilike '%firelight%'
       and (select count(*) from sub_projects sp where sp.project_id = p.id) = 1
  loop
    update projects set po_no_site = true where id = r.id;
    raise notice 'No site question on POs: %', r.name;
  end loop;
end $$;
