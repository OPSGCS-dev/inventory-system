-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after ownership_location_01_schema.sql, add_transfer_pos.sql and add_transfer_po_request_stage.sql
-- (it replaces five of the functions those files define).
--
-- 1. A new physical location, 'office', next to 'storage' (shown in the app as "Oshawa" -- the stored
--    name stays 'storage', only the label changed) and 'barn'.
-- 2. Entities that never keep parts on their own site. projects.has_site_stock (default true) is set to
--    false, once, for FLOPS and Firelight Solar. Such an entity still OWNS parts, but they are kept in
--    Oshawa, the Barn or the Office, never on a "site":
--      * no site column for it on the Physical Location list;
--      * nothing can be moved or transferred onto its site (the database refuses);
--      * parts received on its POs, and units added by a count, go to Oshawa (move them to the Office
--        afterwards with Update Location);
--      * any units that are on such a site right now are moved to Oshawa below, with a History entry.
--    Change the flag on projects.has_site_stock if that ever changes.

begin;

-- 1. 'office' as a location --------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.stock_location'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%barn%'
  loop
    execute format('alter table public.stock_location drop constraint %I', c);
  end loop;
end $$;
alter table public.stock_location add constraint stock_location_location_check
  check (location in ('storage', 'barn', 'office', 'site'));

-- 2. Entities without a site -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'projects' and column_name = 'has_site_stock') then
    alter table public.projects add column has_site_stock boolean not null default true;
    update public.projects set has_site_stock = false where name ilike 'FLOPS%' or name ilike 'Firelight%';
  end if;
end $$;

-- Where units for this entity land when no place is given: its own site, or Oshawa if it has none.
create or replace function inv_private.home_loc(p_project bigint)
returns text language sql stable set search_path = public, pg_temp
as $$ select case when coalesce((select has_site_stock from public.projects where id = p_project), true) then 'site' else 'storage' end $$;

-- R1 and R2 as before, plus R3: an entity without a site holds nothing on it.
create or replace function inv_private.assert_part_ok(p_part integer)
returns void language plpgsql set search_path = public, pg_temp
as $$
declare r record; sum_o bigint; sum_l bigint;
begin
  for r in
    select l.project_id, l.quantity as at_site, inv_private.owned(p_part, l.project_id) as owned,
           coalesce(p.has_site_stock, true) as has_site, p.name
    from public.stock_location l left join public.projects p on p.id = l.project_id
    where l.part_gcs_id = p_part and l.location = 'site'
  loop
    if r.at_site > r.owned then
      raise exception 'A site can only hold parts it owns (entity % would hold % but own %).', r.project_id, r.at_site, r.owned;
    end if;
    if r.at_site > 0 and not r.has_site then
      raise exception '% has no site of its own, so it can''t hold parts there. Use Oshawa, the Barn or the Office.', r.name;
    end if;
  end loop;
  select coalesce(sum(quantity), 0) into sum_o from public.stock_on_hand where part_gcs_id = p_part;
  select coalesce(sum(quantity), 0) into sum_l from public.stock_location where part_gcs_id = p_part;
  if sum_o <> sum_l then
    raise exception 'Ownership (%) and physical locations (%) would no longer match for this part.', sum_o, sum_l;
  end if;
end;
$$;

-- 3. The functions, now knowing about the Office and about entities without a site -------------
-- Stock Transfer (as in add_transfer_pos.sql, which also writes the PO between the entities).
create or replace function public.fn_stock_transfer(
  p_part integer, p_from bigint, p_to bigint, p_qty integer, p_note text,
  p_from_loc text default null, p_to_loc text default 'site')
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; po_no text;
  from_owned integer; to_owned integer; site_from integer; off_from integer;
  src text; src_proj bigint; dst_proj bigint;
  src_prev integer; dst_prev integer; same_place boolean;
begin
  uid := inv_private.require_role('inventory');
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
  if p_from = p_to then raise exception 'Destination must be a different entity.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_to_loc not in ('site', 'storage', 'barn', 'office') then raise exception 'Unknown destination location.'; end if;
  if p_from_loc is not null and p_from_loc not in ('site', 'storage', 'barn', 'office') then raise exception 'Unknown source location.'; end if;
  if p_to_loc = 'site' and inv_private.home_loc(p_to) <> 'site' then
    raise exception '% has no site of its own — choose Oshawa, the Barn or the Office.', inv_private.project_name(p_to);
  end if;
  if not exists (select 1 from public.project_parts where project_id = p_to and part_gcs_id = p_part) then
    raise exception '% doesn''t use this part — add it on Required Inventory first.', inv_private.project_name(p_to);
  end if;

  from_owned := inv_private.owned(p_part, p_from);
  if from_owned < p_qty then
    raise exception 'Not enough owned by % (% available).', inv_private.project_name(p_from), from_owned;
  end if;
  site_from := inv_private.loc_qty(p_part, 'site', p_from);
  off_from := from_owned - site_from;

  if p_from_loc is null then
    if site_from >= p_qty then src := 'site';
    elsif off_from >= p_qty and inv_private.loc_qty(p_part, 'storage', null) >= p_qty then src := 'storage';
    elsif off_from >= p_qty and inv_private.loc_qty(p_part, 'barn', null) >= p_qty then src := 'barn';
    elsif off_from >= p_qty and inv_private.loc_qty(p_part, 'office', null) >= p_qty then src := 'office';
    else raise exception 'The units to transfer are spread across more than one place. Choose where they are being taken from.';
    end if;
  else
    src := p_from_loc;
  end if;

  if src = 'site' then
    if site_from < p_qty then raise exception '% only has % on its own site.', inv_private.project_name(p_from), site_from; end if;
    src_proj := p_from;
  else
    if off_from < p_qty then raise exception '% only has % that are not on its own site.', inv_private.project_name(p_from), off_from; end if;
    if inv_private.loc_qty(p_part, src, null) < p_qty then raise exception 'Not enough in %.', src; end if;
    src_proj := null;
  end if;
  dst_proj := case when p_to_loc = 'site' then p_to else null end;
  same_place := (src = p_to_loc) and (src_proj is not distinct from dst_proj);

  to_owned := inv_private.owned(p_part, p_to);
  jid := inv_private.new_journal('transfer',
    trim(p_note) || ' (' || inv_private.project_name(p_from) || ' → ' || inv_private.project_name(p_to) || ')', uid);

  perform inv_private.set_owned(p_part, p_from, from_owned - p_qty);
  perform inv_private.set_owned(p_part, p_to, to_owned + p_qty);
  insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity) values
    (jid, p_from, p_part, from_owned, from_owned - p_qty),
    (jid, p_to, p_part, to_owned, to_owned + p_qty);

  if not same_place then
    src_prev := inv_private.loc_qty(p_part, src, src_proj);
    dst_prev := inv_private.loc_qty(p_part, p_to_loc, dst_proj);
    perform inv_private.add_loc(p_part, src, src_proj, -p_qty);
    perform inv_private.add_loc(p_part, p_to_loc, dst_proj, p_qty);
    insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty) values
      (jid, p_part, src, src_proj, src_prev, src_prev - p_qty),
      (jid, p_part, p_to_loc, dst_proj, dst_prev, dst_prev + p_qty);
  end if;

  perform inv_private.assert_part_ok(p_part);

  -- the purchase order between the two entities, and a pointer to it in History
  po_no := inv_private.create_transfer_po(p_part, p_from, p_to, p_qty, p_note, uid);
  update public.inventory_journal set note = note || ' — ' || po_no where id = jid;
  return jid;
end;
$$;

-- Update Location: move units between places, ownership unchanged.
create or replace function public.fn_move_location(
  p_part integer, p_from_loc text, p_from_project bigint, p_to_loc text, p_to_project bigint,
  p_qty integer, p_note text)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; src_prev integer; dst_prev integer; own integer; at_site integer;
  fp bigint := case when p_from_loc = 'site' then p_from_project else null end;
  tp bigint := case when p_to_loc = 'site' then p_to_project else null end;
begin
  uid := inv_private.require_role('inventory');
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_from_loc not in ('site', 'storage', 'barn', 'office') or p_to_loc not in ('site', 'storage', 'barn', 'office') then
    raise exception 'Unknown location.';
  end if;
  if (p_from_loc = 'site' and fp is null) or (p_to_loc = 'site' and tp is null) then
    raise exception 'Choose which site.';
  end if;
  if p_from_loc = p_to_loc and fp is not distinct from tp then raise exception 'Those are the same place.'; end if;
  if p_from_loc = 'site' and p_to_loc = 'site' then
    raise exception 'Parts can''t move straight from one site to another. Transfer ownership first (Stock Transfer), which moves them with it.';
  end if;
  if p_to_loc = 'site' and inv_private.home_loc(tp) <> 'site' then
    raise exception '% has no site of its own — choose Oshawa, the Barn or the Office.', inv_private.project_name(tp);
  end if;

  src_prev := inv_private.loc_qty(p_part, p_from_loc, fp);
  if src_prev < p_qty then raise exception 'Only % in that location.', src_prev; end if;

  if p_to_loc = 'site' then
    own := inv_private.owned(p_part, tp);
    at_site := inv_private.loc_qty(p_part, 'site', tp);
    if own - at_site < p_qty then
      raise exception '% only owns % that are not already on its site. A site can only hold parts it owns.',
        inv_private.project_name(tp), own - at_site;
    end if;
  end if;

  dst_prev := inv_private.loc_qty(p_part, p_to_loc, tp);
  jid := inv_private.new_journal('location_move', trim(p_note), uid);
  perform inv_private.add_loc(p_part, p_from_loc, fp, -p_qty);
  perform inv_private.add_loc(p_part, p_to_loc, tp, p_qty);
  insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty) values
    (jid, p_part, p_from_loc, fp, src_prev, src_prev - p_qty),
    (jid, p_part, p_to_loc, tp, dst_prev, dst_prev + p_qty);
  perform inv_private.assert_part_ok(p_part);
  return jid;
end;
$$;

-- Record Part Use: take units out of a place, and out of that owner's count.
create or replace function public.fn_record_use(
  p_part integer, p_location text, p_owner bigint, p_qty integer, p_note text)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; own integer; loc_prev integer; at_site integer;
  lp bigint := case when p_location = 'site' then p_owner else null end;
begin
  uid := inv_private.require_role('inventory');
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_location not in ('site', 'storage', 'barn', 'office') then raise exception 'Unknown location.'; end if;
  if p_owner is null then raise exception 'Choose whose count this comes from.'; end if;

  own := inv_private.owned(p_part, p_owner);
  if own < p_qty then
    raise exception 'Not enough owned by % (% available).', inv_private.project_name(p_owner), own;
  end if;
  loc_prev := inv_private.loc_qty(p_part, p_location, lp);
  if loc_prev < p_qty then raise exception 'Only % in that location.', loc_prev; end if;
  if p_location <> 'site' then
    at_site := inv_private.loc_qty(p_part, 'site', p_owner);
    if own - at_site < p_qty then
      raise exception '% only has % that are not on its own site.', inv_private.project_name(p_owner), own - at_site;
    end if;
  end if;

  jid := inv_private.new_journal('use', trim(p_note), uid);
  perform inv_private.set_owned(p_part, p_owner, own - p_qty);
  perform inv_private.add_loc(p_part, p_location, lp, -p_qty);
  insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity)
    values (jid, p_owner, p_part, own, own - p_qty);
  insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
    values (jid, p_part, p_location, lp, loc_prev, loc_prev - p_qty);
  perform inv_private.assert_part_ok(p_part);
  return jid;
end;
$$;

-- Counts: set ownership to a new total. Extra units appear on the owner's own site (Oshawa, if it has no
-- site); removed units come off its site first, then Oshawa, the Barn, then the Office.
create or replace function public.fn_apply_count(p_entry_type text, p_note text, p_rows jsonb)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; r record; cur integer; delta integer; take integer; left_to_take integer;
  loc text; prev_loc integer; parts_touched integer[] := '{}'; home text;
begin
  uid := inv_private.require_role('inventory');
  if p_entry_type not in ('adjustment', 'count') then raise exception 'Unknown entry type.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to apply.';
  end if;

  jid := inv_private.new_journal(p_entry_type, trim(p_note), uid);

  for r in select (x->>'part')::integer as part, (x->>'project')::bigint as project, (x->>'quantity')::integer as quantity
           from jsonb_array_elements(p_rows) x
  loop
    if r.quantity is null or r.quantity < 0 then raise exception 'Quantities must be zero or more.'; end if;
    cur := inv_private.owned(r.part, r.project);
    delta := r.quantity - cur;
    if delta = 0 then continue; end if;

    perform inv_private.set_owned(r.part, r.project, r.quantity);
    insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity)
      values (jid, r.project, r.part, cur, r.quantity);

    if delta > 0 then
      home := inv_private.home_loc(r.project);
      prev_loc := inv_private.loc_qty(r.part, home, case when home = 'site' then r.project else null end);
      perform inv_private.add_loc(r.part, home, case when home = 'site' then r.project else null end, delta);
      insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
        values (jid, r.part, home, case when home = 'site' then r.project else null end, prev_loc, prev_loc + delta);
    else
      left_to_take := -delta;
      foreach loc in array array['site', 'storage', 'barn', 'office'] loop
        exit when left_to_take = 0;
        prev_loc := inv_private.loc_qty(r.part, loc, case when loc = 'site' then r.project else null end);
        take := least(prev_loc, left_to_take);
        if take > 0 then
          perform inv_private.add_loc(r.part, loc, case when loc = 'site' then r.project else null end, -take);
          insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
            values (jid, r.part, loc, case when loc = 'site' then r.project else null end, prev_loc, prev_loc - take);
          left_to_take := left_to_take - take;
        end if;
      end loop;
      if left_to_take > 0 then
        raise exception 'Part % has fewer units in its locations than the count removes. Fix locations first.', r.part;
      end if;
    end if;
    parts_touched := parts_touched || r.part;
  end loop;

  for r in select distinct unnest(parts_touched) as part loop
    perform inv_private.assert_part_ok(r.part);
  end loop;
  return jid;
end;
$$;

-- PO receiving: spare lines add to the issuing entity's count and land on its own site (Oshawa, if it has
-- none). Transfer lines are never added again (the stock moved with the transfer).
create or replace function public.fn_receive_po_parts(p_request_id bigint)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; req record; jid bigint; r record; cur integer; prev_loc integer; vendor_name text;
  any_lines boolean := false; home text; hp bigint;
begin
  uid := inv_private.require_active_user();
  select id, project_id, po_number, vendor_id, requested_by into req from public.purchase_requests where id = p_request_id;
  if not found then raise exception 'Purchase request not found.'; end if;
  if uid is not null and req.requested_by is distinct from uid then
    raise exception 'Only the person who requested this PO can receive its parts.' using errcode = '42501';
  end if;
  home := inv_private.home_loc(req.project_id);
  hp := case when home = 'site' then req.project_id else null end;

  select coalesce(name, 'Unknown Vendor') into vendor_name from public.vendors where id = req.vendor_id;
  vendor_name := coalesce(vendor_name, 'Unknown Vendor');
  jid := inv_private.new_journal('po_received',
    'PO ' || coalesce(req.po_number, '#' || req.id) || ' received from ' || vendor_name, uid);

  for r in
    select part_gcs_id as part, sum(quantity)::integer as qty
    from public.purchase_request_lines
    where purchase_request_id = p_request_id and line_type = 'part' and part_gcs_id is not null
      and coalesce(inventory_action, '') not in ('used_immediately', 'consumable', 'transfer')
    group by part_gcs_id
  loop
    any_lines := true;
    cur := inv_private.owned(r.part, req.project_id);
    perform inv_private.set_owned(r.part, req.project_id, cur + r.qty);
    insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity)
      values (jid, req.project_id, r.part, cur, cur + r.qty);
    prev_loc := inv_private.loc_qty(r.part, home, hp);
    perform inv_private.add_loc(r.part, home, hp, r.qty);
    insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
      values (jid, r.part, home, hp, prev_loc, prev_loc + r.qty);
    perform inv_private.assert_part_ok(r.part);
  end loop;

  if not any_lines then
    delete from public.inventory_journal where id = jid;
    return null;
  end if;
  return jid;
end;
$$;

-- 4. Units already sitting on a site that doesn't hold parts go to Oshawa, with a History entry ------
do $$
declare
  r record; jid bigint; moved integer := 0;
begin
  for r in
    select l.part_gcs_id as part, l.project_id, l.quantity
    from public.stock_location l join public.projects p on p.id = l.project_id
    where l.location = 'site' and l.quantity > 0 and not coalesce(p.has_site_stock, true)
    order by l.part_gcs_id, l.project_id
  loop
    if jid is null then
      jid := inv_private.new_journal('location_move', 'Moved to Oshawa: this entity has no site of its own to hold parts', null);
    end if;
    perform inv_private.add_loc(r.part, 'site', r.project_id, -r.quantity);
    perform inv_private.add_loc(r.part, 'storage', null, r.quantity);
    insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty) values
      (jid, r.part, 'site', r.project_id, r.quantity, 0),
      (jid, r.part, 'storage', null,
        inv_private.loc_qty(r.part, 'storage', null) - r.quantity, inv_private.loc_qty(r.part, 'storage', null));
    moved := moved + 1;
  end loop;
  -- Checked once everything has moved (two such entities can hold the same part).
  for r in
    select distinct l.part_gcs_id as part from public.inventory_journal_lines l where l.journal_id = jid and l.part_gcs_id is not null
  loop
    perform inv_private.assert_part_ok(r.part);
  end loop;
  raise notice 'Moved % site row(s) of parts to Oshawa because that entity has no site to hold them.', moved;
end $$;

commit;
