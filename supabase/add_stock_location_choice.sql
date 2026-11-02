-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_office_location.sql (it replaces two of the functions that file defines).
--
-- Lets a person say WHERE the physical units go, instead of the database picking the entity's own site:
--   * fn_receive_po_parts(p_request_id, p_location): marking a PO's parts Received puts the spare units in
--     the chosen place -- 'site' (the entity's own site), 'storage' (Oshawa), 'barn' or 'office'. With no
--     place given it still uses the entity's home place (its own site, or Oshawa if it has none).
--   * fn_apply_count: each row may carry an optional "location". An increase puts the extra units there; a
--     decrease takes them out of there only (and refuses if they aren't there). A row with no location
--     behaves as before (extra units on the owner's own site; removed units from its site, then Oshawa,
--     the Barn, then the Office). The Update Count upload sends no locations, so it is unchanged.
--   * fn_stock_location_choice_ready(): the app asks this to know the file has been run; until it has, the
--     app doesn't offer the location prompts and works exactly as before.

begin;

create or replace function public.fn_stock_location_choice_ready()
returns boolean language sql stable set search_path = public, pg_temp
as $$ select true $$;
revoke execute on function public.fn_stock_location_choice_ready() from public, anon;
grant execute on function public.fn_stock_location_choice_ready() to authenticated, service_role;

-- PO receiving ----------------------------------------------------------------------------------
-- A new signature (the second argument), so the one-argument version has to go or a call with only the
-- request id would be ambiguous.
drop function if exists public.fn_receive_po_parts(bigint);

create or replace function public.fn_receive_po_parts(p_request_id bigint, p_location text default null)
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

  if coalesce(p_location, '') = '' then
    home := inv_private.home_loc(req.project_id);
  else
    if p_location not in ('site', 'storage', 'barn', 'office') then raise exception 'Unknown location.'; end if;
    if p_location = 'site' and inv_private.home_loc(req.project_id) <> 'site' then
      raise exception '% has no site of its own — choose Oshawa, the Barn or the Office.', inv_private.project_name(req.project_id);
    end if;
    home := p_location;
  end if;
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
revoke execute on function public.fn_receive_po_parts(bigint, text) from public, anon;
grant execute on function public.fn_receive_po_parts(bigint, text) to authenticated, service_role;

-- Counts / individual adjustments ----------------------------------------------------------------
create or replace function public.fn_apply_count(p_entry_type text, p_note text, p_rows jsonb)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; r record; cur integer; delta integer; take integer; left_to_take integer;
  loc text; prev_loc integer; parts_touched integer[] := '{}'; home text; hp bigint;
  site_units integer;
begin
  uid := inv_private.require_role('inventory');
  if p_entry_type not in ('adjustment', 'count') then raise exception 'Unknown entry type.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to apply.';
  end if;

  jid := inv_private.new_journal(p_entry_type, trim(p_note), uid);

  for r in select (x->>'part')::integer as part, (x->>'project')::bigint as project, (x->>'quantity')::integer as quantity,
                  nullif(x->>'location', '') as location
           from jsonb_array_elements(p_rows) x
  loop
    if r.quantity is null or r.quantity < 0 then raise exception 'Quantities must be zero or more.'; end if;
    if r.location is not null and r.location not in ('site', 'storage', 'barn', 'office') then
      raise exception 'Unknown location.';
    end if;
    cur := inv_private.owned(r.part, r.project);
    delta := r.quantity - cur;
    if delta = 0 then continue; end if;

    perform inv_private.set_owned(r.part, r.project, r.quantity);
    insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity)
      values (jid, r.project, r.part, cur, r.quantity);

    if delta > 0 then
      home := coalesce(r.location, inv_private.home_loc(r.project));
      if home = 'site' and inv_private.home_loc(r.project) <> 'site' then
        raise exception '% has no site of its own — choose Oshawa, the Barn or the Office.', inv_private.project_name(r.project);
      end if;
      hp := case when home = 'site' then r.project else null end;
      prev_loc := inv_private.loc_qty(r.part, home, hp);
      perform inv_private.add_loc(r.part, home, hp, delta);
      insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
        values (jid, r.part, home, hp, prev_loc, prev_loc + delta);
    elsif r.location is not null then
      -- Taken from the place the person chose, and only from there.
      hp := case when r.location = 'site' then r.project else null end;
      prev_loc := inv_private.loc_qty(r.part, r.location, hp);
      if prev_loc < -delta then
        raise exception 'Part %: only % in %, so % can''t be taken from there.',
          r.part, prev_loc,
          case r.location when 'site' then inv_private.project_name(r.project) || '''s own site'
                          when 'storage' then 'Oshawa' when 'barn' then 'the Barn' else 'the Office' end,
          -delta;
      end if;
      if r.location <> 'site' then
        site_units := inv_private.loc_qty(r.part, 'site', r.project);
        if cur - site_units < -delta then
          raise exception 'Part %: % only has % that are not on its own site, so % can''t be taken from there.',
            r.part, inv_private.project_name(r.project), cur - site_units, -delta;
        end if;
      end if;
      perform inv_private.add_loc(r.part, r.location, hp, delta);
      insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
        values (jid, r.part, r.location, hp, prev_loc, prev_loc + delta);
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

commit;
