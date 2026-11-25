-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_projects_layer.sql, add_budget_amounts.sql and add_po_rebill_entity.sql.
--
-- Budget types. What the app called a "Project" (Regular O&M, Repower - Phase 1 / 2; table `programs`) is now a
-- BUDGET TYPE, with the structure from "Firelight Budget Categories.xlsx":
--
--   Regular Operations - Ground Mount   O&M (12 sub-categories), O&M Overage (6)
--   Regular Operations - Rooftop        O&M (8 sub-categories),  O&M Overage (4)
--   Repower                             11 categories, no sub-categories
--
-- What this file does to the data that is already there:
--   * The old "Regular O&M" type is kept as it is -- with every PO, category and 2026 budget amount that is on it --
--     but marked retired (`programs.active = false`): it is not offered on new POs, and still shows on the Budget tab
--     and PO list for the old POs. Nothing on it is moved or deleted.
--   * The two Repower types are combined into one, "Repower", keeping their entities, categories and POs.
--   * Two new types, Ground Mount and Rooftop, are created and given their categories and sub-categories.
--       Rooftop       = Firelight Solar LP and Firelight Operations LP (FLOPS)
--       Ground Mount  = every other entity that was in Regular O&M, and FLOPS
--     (The two types are restricted to those entities; change them any time in Admin > Budget Types.)
--   * Re-billing is automatic, so the "Chargeable Expense" tick box is gone from the PO form: a PO issued by an entity
--     that can re-bill (Admin > Entities > Can re-bill expenses: FLOPS) under a category that re-bills
--     (`budget_categories.rebills`, ticked here for both "O&M Overage" categories) is a chargeable expense, and the PO
--     form asks which other entity it is re-billed to. Existing chargeable POs keep what they have.
--   * Categories and sub-categories get an `active` flag (retired ones are hidden on the PO form but stay on old POs).
--   * The PO a Stock Transfer writes now goes on the budget type that holds the receiving entity, in a hidden
--     "Inventory" category.
-- Run again if you add more later; the new types are only created once.

-- 1. New columns ---------------------------------------------------------------------------------------

alter table public.programs add column if not exists active boolean not null default true;
alter table public.budget_categories add column if not exists active boolean not null default true;
alter table public.budget_categories add column if not exists rebills boolean not null default false;
alter table public.budget_subcategories add column if not exists active boolean not null default true;

-- 2. Repower: one type instead of two ----------------------------------------------------------------------

do $$
declare
  p1 bigint; p2 bigint; r record; m bigint; left_over integer;
begin
  if exists (select 1 from public.programs where name = 'Repower') then
    return; -- already done
  end if;
  select id into p1 from public.programs where name = 'Repower - Phase 1';
  select id into p2 from public.programs where name = 'Repower - Phase 2';

  if p1 is null and p2 is null then
    insert into public.programs (name, invoice_email, tracks_inventory, sort_order)
    values ('Repower', 'repower@greatcirclesolar.com', false, 3);
    return;
  end if;
  if p1 is null then
    p1 := p2; p2 := null; -- only Phase 2 exists: it becomes Repower
  end if;

  if p2 is not null then
    insert into public.program_sites (program_id, project_id)
    select p1, project_id from public.program_sites where program_id = p2
    on conflict do nothing;

    for r in select id, name from public.budget_categories where program_id = p2 loop
      select id into m from public.budget_categories where program_id = p1 and lower(name) = lower(r.name) order by id limit 1;
      if m is null then
        update public.budget_categories set program_id = p1 where id = r.id; -- no clash: it just moves over
      else
        update public.budget_subcategories set category_id = m where category_id = r.id;
        update public.purchase_requests set program_id = p1, budget_category_id = m where budget_category_id = r.id;
        update public.budget_amounts b set category_id = m
          where b.category_id = r.id
            and not exists (select 1 from public.budget_amounts x
                            where x.year = b.year and x.project_id = b.project_id and x.category_id = m
                              and coalesce(x.subcategory_id, 0) = coalesce(b.subcategory_id, 0));
        if not exists (select 1 from public.budget_amounts where category_id = r.id)
           and not exists (select 1 from public.purchase_requests where budget_category_id = r.id) then
          delete from public.budget_categories where id = r.id;
        else
          raise notice 'Phase 2 category "%" still has budget amounts that clash with Phase 1''s; it was left in place.', r.name;
        end if;
      end if;
    end loop;

    update public.purchase_requests set program_id = p1 where program_id = p2;
    select count(*) into left_over from public.budget_categories where program_id = p2;
    if left_over = 0 then
      delete from public.programs where id = p2;
    else
      update public.programs set active = false where id = p2;
      raise notice 'Repower - Phase 2 was kept (retired) because % category(ies) could not be merged.', left_over;
    end if;
  end if;

  update public.programs set name = 'Repower', sort_order = 3 where id = p1;
end $$;

-- 3. The two Regular Operations types ------------------------------------------------------------------------

do $$
declare
  old_id bigint; gm bigint; rt bigint; email text;
begin
  if exists (select 1 from public.programs where name = 'Regular Operations – Ground Mount') then
    return; -- already created (later edits are made in Admin)
  end if;

  select id, invoice_email into old_id, email from public.programs where name = 'Regular O&M';
  email := coalesce(email, 'ap@greatcirclesolar.com');

  insert into public.programs (name, invoice_email, tracks_inventory, sort_order) values
    ('Regular Operations – Ground Mount', email, true, 1),
    ('Regular Operations – Rooftop', email, true, 2)
  on conflict (name) do nothing;
  select id into gm from public.programs where name = 'Regular Operations – Ground Mount';
  select id into rt from public.programs where name = 'Regular Operations – Rooftop';

  -- Rooftop: Firelight Solar and FLOPS. Ground mount: everything else that was in Regular O&M, and FLOPS.
  insert into public.program_sites (program_id, project_id)
  select rt, p.id from public.projects p
  where p.name ilike 'Firelight Solar%' or p.name ilike 'Firelight Operations%' or p.name = 'FLOPS'
  on conflict do nothing;

  insert into public.program_sites (program_id, project_id)
  select gm, p.id from public.projects p
  where (old_id is null or p.id in (select project_id from public.program_sites where program_id = old_id))
    and not (p.name ilike 'Firelight Solar%')
  on conflict do nothing;
  -- FLOPS is in both, whatever its row says.
  insert into public.program_sites (program_id, project_id)
  select gm, p.id from public.projects p where p.name ilike 'Firelight Operations%' or p.name = 'FLOPS'
  on conflict do nothing;

  -- The old type stays for the POs and budget already on it, but is no longer offered.
  if old_id is not null then
    update public.programs set active = false, tracks_inventory = false, sort_order = 90 where id = old_id;
  end if;

  raise notice 'Rooftop entities: %', (select string_agg(p.name, ', ' order by p.name)
    from public.program_sites ps join public.projects p on p.id = ps.project_id where ps.program_id = rt);
  raise notice 'Ground Mount entities: %', (select string_agg(p.name, ', ' order by p.name)
    from public.program_sites ps join public.projects p on p.id = ps.project_id where ps.program_id = gm);
end $$;

-- 4. Categories and sub-categories ---------------------------------------------------------------------------

do $$
declare
  gm bigint := (select id from public.programs where name = 'Regular Operations – Ground Mount');
  rt bigint := (select id from public.programs where name = 'Regular Operations – Rooftop');
  rp bigint := (select id from public.programs where name = 'Repower');
  r record; cat bigint;
begin
  if gm is null or rt is null then return; end if;

  for r in
    select * from (values
      -- type, category, rebills, sub-category (null = none), order
      (gm, 'O&M', false, 'Maintenance Agreement (FLOPs)', 1),
      (gm, 'O&M', false, 'GCS Operations Management Base', 2),
      (gm, 'O&M', false, 'Operations Management – Contingent on Distribution Approval', 3),
      (gm, 'O&M', false, 'Performance – Contingent on Distribution Approval', 4),
      (gm, 'O&M', false, 'Security Monitoring', 5),
      (gm, 'O&M', false, 'Insurance', 6),
      (gm, 'O&M', false, 'Utilities', 7),
      (gm, 'O&M', false, 'Property Tax/Rent', 8),
      (gm, 'O&M', false, 'Developer Royalty', 9),
      (gm, 'O&M', false, 'Administrative', 10),
      (gm, 'O&M', false, 'Collateral & Admin Agency Fee', 11),
      (gm, 'O&M', false, 'Audit, Legal & Bank Fees', 12),
      (gm, 'O&M Overage', true, 'Inverter Spare Parts Replenishment', 1),
      (gm, 'O&M Overage', true, 'Planned O&M Initiatives', 2),
      (gm, 'O&M Overage', true, 'Unplanned / Out-of-Scope Maintenance', 3),
      (gm, 'O&M Overage', true, 'HV Spares Replenishment', 4),
      (gm, 'O&M Overage', true, 'Tracker Parts Replenishment', 5),
      (gm, 'O&M Overage', true, 'O&M Consumables', 6),
      (rt, 'O&M', false, 'Contracted Preventative Maintenance', 1),
      (rt, 'O&M', false, 'Monitoring / Telecomm / Utilities', 2),
      (rt, 'O&M', false, 'Insurance', 3),
      (rt, 'O&M', false, 'Asset / Ops Management – Fixed Fees', 4),
      (rt, 'O&M', false, 'Asset / Ops Management – Variable Fees', 5),
      (rt, 'O&M', false, 'Admin Agency Fees', 6),
      (rt, 'O&M', false, 'Audit / Tax / Legal / Bank Fees', 7),
      (rt, 'O&M', false, 'Roof Leases', 8),
      (rt, 'O&M Overage', true, 'Planned Initiatives', 1),
      (rt, 'O&M Overage', true, 'Call Outs / Repairs', 2),
      (rt, 'O&M Overage', true, 'Spare Parts Replenishment / Consumables', 3),
      (rt, 'O&M Overage', true, 'Other Misc.', 4)
    ) as v(program_id, category, rebills, sub, ord)
    order by program_id, category, ord
  loop
    select id into cat from public.budget_categories where program_id = r.program_id and name = r.category;
    if cat is null then
      insert into public.budget_categories (program_id, name, rebills) values (r.program_id, r.category, r.rebills)
      returning id into cat;
    end if;
    if not exists (select 1 from public.budget_subcategories where category_id = cat and name = r.sub) then
      insert into public.budget_subcategories (category_id, name) values (cat, r.sub);
    end if;
  end loop;

  -- Repower: categories only (they exist already when the old Repower types did; add any that are missing).
  if rp is not null then
    insert into public.budget_categories (program_id, name)
    select rp, v.n from (values
      ('Engineering & Permitting'), ('Legal, IE, Insurance'), ('Modules'), ('Purlins'), ('Other Equipment'),
      ('Mechanical Labour'), ('Electrical Labour'), ('Construction Mgmt Labour'), ('Shipping / Logistics'),
      ('PRMA Fees'), ('Contingency')
    ) as v(n)
    where not exists (select 1 from public.budget_categories c where c.program_id = rp and c.name = v.n);
  end if;
end $$;

-- 5. Stock transfers: the PO goes on the budget type that holds the receiving entity --------------------------

create or replace function inv_private.create_transfer_po(
  p_part integer, p_from bigint, p_to bigint, p_qty integer, p_note text, p_uid bigint)
returns text
language plpgsql set search_path = public, inv_private, pg_temp
as $$
declare
  sender text := inv_private.project_name(p_from);
  receiver text := inv_private.project_name(p_to);
  vendor bigint; code text; yy text; prefix text; seq integer; po_no text; rid bigint;
  cost numeric; part_text text; prog bigint; cat bigint;
begin
  select id into vendor from public.vendors where lower(name) = lower(sender) order by id limit 1;
  if vendor is null then
    insert into public.vendors (name, notes)
    values (sender, 'Internal vendor, created automatically for stock transfers out of this entity.')
    returning id into vendor;
  end if;

  select lpad(coalesce(nullif(trim(project_code), ''), p_to::text), 2, '0') into code from public.projects where id = p_to;
  yy := to_char(now(), 'YY');
  prefix := code || '-' || yy || '-';
  select coalesce(max((substring(po_number from '-(\d{3})$'))::int), 0) + 1 into seq
  from public.purchase_requests where project_id = p_to and po_number like 'PO-' || prefix || '%';
  insert into public.po_number_sequences (project_id, year_code, last_seq) values (p_to, yy, seq)
  on conflict (project_id, year_code)
  do update set last_seq = greatest(public.po_number_sequences.last_seq + 1, excluded.last_seq)
  returning last_seq into seq;
  po_no := 'PO-' || prefix || lpad(seq::text, 3, '0');

  -- The first active budget type that keeps inventory and holds the receiving entity, and its "Inventory"
  -- category (hidden from the PO form: only transfers use it).
  select g.id into prog
  from public.programs g
  join public.program_sites ps on ps.program_id = g.id and ps.project_id = p_to
  where g.tracks_inventory and g.active
  order by g.sort_order, g.id limit 1;
  if prog is not null then
    select id into cat from public.budget_categories where program_id = prog and lower(name) = 'inventory' order by id limit 1;
    if cat is null then
      insert into public.budget_categories (program_id, name, active) values (prog, 'Inventory', false) returning id into cat;
    end if;
  end if;

  select coalesce(last_cost, 0), coalesce(nullif(trim(description), ''), gcs_part_id)
  into cost, part_text from public.parts where gcs_id = p_part;

  insert into public.purchase_requests (
    project_id, program_id, vendor_id, status, po_number, description, notes,
    requested_by, submitted_at, budget_category_id,
    parts_status, markup_rate, tax_rate, shipping_handling, credit
  ) values (
    p_to, prog, vendor, 'submitted', po_no, 'Stock transfer: ' || sender || ' → ' || receiver, trim(p_note),
    p_uid, now(), cat,
    'not_ordered', 0, 0, 0, 0
  ) returning id into rid;

  insert into public.purchase_request_lines (
    purchase_request_id, line_type, part_gcs_id, description, quantity, unit_cost, inventory_action)
  values (rid, 'part', p_part, part_text, p_qty, cost, 'transfer');

  insert into public.purchase_request_activity (purchase_request_id, user_id, note)
  values (rid, p_uid, '• Created automatically from a stock transfer (' || sender || ' → ' || receiver || '); the stock has already moved. This PO still has to be approved, issued and settled.');

  return po_no;
end;
$$;

notify pgrst, 'reload schema';
