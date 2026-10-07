-- Ownership and Physical Location, part 1 of 3: schema and functions.
-- Run in the Supabase SQL editor of the INVENTORY project (a TEST COPY first).
--
-- Two separate sets of numbers per part:
--   OWNERSHIP  O[entity][part]    public.stock_on_hand        (already exists)
--   PHYSICAL   L[location][part]  public.stock_location       (new)
--              location = 'storage' | 'barn' | 'site' (+ the entity that owns that site)
--
-- Rules, checked by the database after every change:
--   R1  A site only holds what its entity owns:   L[site e] <= O[e]
--   R2  Every owned unit is somewhere:            sum(L) = sum(O)  (per part)
-- Units an entity owns but doesn't keep on its own site are in Storage or the Barn.
--
-- Everything that changes stock now goes through the functions below, which
-- apply the rules, check the caller's role and write the History entry in one
-- step. Nothing here changes who can read data. The old direct writes to
-- stock_on_hand are closed off separately, in part 3, at cutover.
--
-- Undo: ownership_location_rollback.sql.

begin;

-- 1. Private schema for helpers (not reachable through the REST API).
create schema if not exists inv_private;
revoke all on schema inv_private from public, anon, authenticated;

-- 2. Physical locations.
create table if not exists public.stock_location (
  part_gcs_id integer not null references public.parts (gcs_id) on delete cascade,
  location text not null check (location in ('storage', 'barn', 'site')),
  project_id bigint references public.projects (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  project_key bigint generated always as (coalesce(project_id, 0)) stored,
  primary key (part_gcs_id, location, project_key),
  check ((location = 'site') = (project_id is not null))
);
create index if not exists stock_location_project_idx on public.stock_location (project_id);

alter table public.stock_location enable row level security;
drop policy if exists "stock location read" on public.stock_location;
create policy "stock location read" on public.stock_location for select to authenticated
  using (public.is_active_app_user());
-- No insert/update/delete policies on purpose: only the functions below write.

-- 3. History: who did it, and location columns on journal lines.
alter table public.inventory_journal add column if not exists created_by bigint references public.users (id);
alter table public.inventory_journal_lines add column if not exists location text;
alter table public.inventory_journal_lines add column if not exists location_project_id bigint;
alter table public.inventory_journal_lines add column if not exists previous_location_qty integer;
alter table public.inventory_journal_lines add column if not exists new_location_qty integer;

alter table public.inventory_journal drop constraint if exists inventory_journal_entry_type_check;
alter table public.inventory_journal add constraint inventory_journal_entry_type_check
  check (entry_type in (
    'adjustment', 'location_adjustment', 'use', 'transfer', 'count', 'po_received',
    'location_move', 'opening'
  ));

-- 4. Helpers (private).
create or replace function inv_private.require_role(p_role text)
returns bigint
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare u record;
begin
  -- No signed-in user means the service role or the SQL editor: trusted.
  if auth.uid() is null then return null; end if;
  select id, roles, active into u from public.users where auth_user_id = auth.uid();
  if not found or not u.active or not (p_role = any (coalesce(u.roles, '{}'))) then
    raise exception 'You need the % role to do this.', p_role using errcode = '42501';
  end if;
  return u.id;
end;
$$;

-- Any signed-in, active app user (no particular role). Null for the service role / SQL editor.
create or replace function inv_private.require_active_user()
returns bigint
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare u record;
begin
  if auth.uid() is null then return null; end if;
  select id, active into u from public.users where auth_user_id = auth.uid();
  if not found or not u.active then
    raise exception 'You need an active account to do this.' using errcode = '42501';
  end if;
  return u.id;
end;
$$;

create or replace function inv_private.owned(p_part integer, p_project bigint)
returns integer language sql set search_path = public, pg_temp
as $$ select coalesce((select quantity from public.stock_on_hand where part_gcs_id = p_part and project_id = p_project), 0) $$;

create or replace function inv_private.loc_qty(p_part integer, p_location text, p_project bigint)
returns integer language sql set search_path = public, pg_temp
as $$ select coalesce((select quantity from public.stock_location
                       where part_gcs_id = p_part and location = p_location
                         and project_key = coalesce(p_project, 0)), 0) $$;

create or replace function inv_private.set_owned(p_part integer, p_project bigint, p_qty integer)
returns void language plpgsql set search_path = public, pg_temp
as $$
begin
  if p_qty < 0 then raise exception 'That would leave a negative quantity.'; end if;
  insert into public.stock_on_hand (project_id, part_gcs_id, quantity, updated_at)
  values (p_project, p_part, p_qty, now())
  on conflict (project_id, part_gcs_id) do update set quantity = excluded.quantity, updated_at = now();
end;
$$;

create or replace function inv_private.add_loc(p_part integer, p_location text, p_project bigint, p_delta integer)
returns void language plpgsql set search_path = public, pg_temp
as $$
declare cur integer;
begin
  cur := inv_private.loc_qty(p_part, p_location, p_project);
  if cur + p_delta < 0 then
    raise exception 'Not enough in that location (% there).', cur;
  end if;
  insert into public.stock_location (part_gcs_id, location, project_id, quantity, updated_at)
  values (p_part, p_location, p_project, cur + p_delta, now())
  on conflict (part_gcs_id, location, project_key) do update set quantity = excluded.quantity, updated_at = now();
end;
$$;

-- R1 and R2 for one part. Raises (and so rolls the whole operation back) on a violation.
create or replace function inv_private.assert_part_ok(p_part integer)
returns void language plpgsql set search_path = public, pg_temp
as $$
declare r record; sum_o bigint; sum_l bigint;
begin
  for r in
    select l.project_id, l.quantity as at_site, inv_private.owned(p_part, l.project_id) as owned
    from public.stock_location l
    where l.part_gcs_id = p_part and l.location = 'site'
  loop
    if r.at_site > r.owned then
      raise exception 'A site can only hold parts it owns (entity % would hold % but own %).', r.project_id, r.at_site, r.owned;
    end if;
  end loop;
  select coalesce(sum(quantity), 0) into sum_o from public.stock_on_hand where part_gcs_id = p_part;
  select coalesce(sum(quantity), 0) into sum_l from public.stock_location where part_gcs_id = p_part;
  if sum_o <> sum_l then
    raise exception 'Ownership (%) and physical locations (%) would no longer match for this part.', sum_o, sum_l;
  end if;
end;
$$;

create or replace function inv_private.new_journal(p_type text, p_note text, p_user bigint)
returns bigint language sql set search_path = public, pg_temp
as $$ insert into public.inventory_journal (entry_type, note, created_by) values (p_type, p_note, p_user) returning id $$;

create or replace function inv_private.project_name(p_project bigint)
returns text language sql stable set search_path = public, pg_temp
as $$ select coalesce((select name from public.projects where id = p_project), 'entity ' || p_project) $$;

-- 5. Stock Transfer: change the owner, and (in the same step) where the units are.
--    p_from_loc: where the units are now ('site' = the sender's own site); null = work it out.
--    p_to_loc:   where they are after ('site' = the receiver's own site, 'storage', 'barn').
create or replace function public.fn_stock_transfer(
  p_part integer, p_from bigint, p_to bigint, p_qty integer, p_note text,
  p_from_loc text default null, p_to_loc text default 'site')
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint;
  from_owned integer; to_owned integer; site_from integer; off_from integer;
  src text; src_proj bigint; dst_proj bigint;
  src_prev integer; dst_prev integer; same_place boolean;
begin
  uid := inv_private.require_role('inventory');
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity greater than zero.'; end if;
  if p_from = p_to then raise exception 'Destination must be a different entity.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A reason is required.'; end if;
  if p_to_loc not in ('site', 'storage', 'barn') then raise exception 'Unknown destination location.'; end if;
  if p_from_loc is not null and p_from_loc not in ('site', 'storage', 'barn') then raise exception 'Unknown source location.'; end if;
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
  return jid;
end;
$$;

-- 6. Update Location: move units between places, ownership unchanged.
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
  if p_from_loc not in ('site', 'storage', 'barn') or p_to_loc not in ('site', 'storage', 'barn') then
    raise exception 'Unknown location.';
  end if;
  if (p_from_loc = 'site' and fp is null) or (p_to_loc = 'site' and tp is null) then
    raise exception 'Choose which site.';
  end if;
  if p_from_loc = p_to_loc and fp is not distinct from tp then raise exception 'Those are the same place.'; end if;
  if p_from_loc = 'site' and p_to_loc = 'site' then
    raise exception 'Parts can''t move straight from one site to another. Transfer ownership first (Stock Transfer), which moves them with it.';
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

-- 7. Record Part Use: take units out of a place, and out of that owner's count.
--    On a site, the owner is that site's entity. From Storage/Barn, p_owner says whose count it comes from.
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
  if p_location not in ('site', 'storage', 'barn') then raise exception 'Unknown location.'; end if;
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

-- 8. Counts (individual adjustments and uploads): set ownership to a new total.
--    p_rows: [{"part": 12, "project": 3, "quantity": 5}, ...]
--    Extra units appear on the owner's own site. Removed units come off the owner's site first,
--    then Storage, then the Barn.
create or replace function public.fn_apply_count(p_entry_type text, p_note text, p_rows jsonb)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; jid bigint; r record; cur integer; delta integer; take integer; left_to_take integer;
  loc text; prev_loc integer; parts_touched integer[] := '{}';
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
      prev_loc := inv_private.loc_qty(r.part, 'site', r.project);
      perform inv_private.add_loc(r.part, 'site', r.project, delta);
      insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
        values (jid, r.part, 'site', r.project, prev_loc, prev_loc + delta);
    else
      left_to_take := -delta;
      foreach loc in array array['site', 'storage', 'barn'] loop
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

-- 9. PO receiving: spare lines add to the issuing entity's count and land on its own site.
--    Only the person who requested the PO may do this (same rule as the screen).
create or replace function public.fn_receive_po_parts(p_request_id bigint)
returns bigint
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare
  uid bigint; req record; jid bigint; r record; cur integer; prev_loc integer; vendor_name text;
  any_lines boolean := false;
begin
  uid := inv_private.require_active_user();
  select id, project_id, po_number, vendor_id, requested_by into req from public.purchase_requests where id = p_request_id;
  if not found then raise exception 'Purchase request not found.'; end if;
  if uid is not null and req.requested_by is distinct from uid then
    raise exception 'Only the person who requested this PO can receive its parts.' using errcode = '42501';
  end if;

  select coalesce(name, 'Unknown Vendor') into vendor_name from public.vendors where id = req.vendor_id;
  vendor_name := coalesce(vendor_name, 'Unknown Vendor');
  jid := inv_private.new_journal('po_received',
    'PO ' || coalesce(req.po_number, '#' || req.id) || ' received from ' || vendor_name, uid);

  for r in
    select part_gcs_id as part, sum(quantity)::integer as qty
    from public.purchase_request_lines
    where purchase_request_id = p_request_id and line_type = 'part' and part_gcs_id is not null
      and coalesce(inventory_action, '') not in ('used_immediately', 'consumable')
    group by part_gcs_id
  loop
    any_lines := true;
    cur := inv_private.owned(r.part, req.project_id);
    perform inv_private.set_owned(r.part, req.project_id, cur + r.qty);
    insert into public.inventory_journal_lines (journal_id, project_id, part_gcs_id, previous_quantity, new_quantity)
      values (jid, req.project_id, r.part, cur, cur + r.qty);
    prev_loc := inv_private.loc_qty(r.part, 'site', req.project_id);
    perform inv_private.add_loc(r.part, 'site', req.project_id, r.qty);
    insert into public.inventory_journal_lines (journal_id, part_gcs_id, location, location_project_id, previous_location_qty, new_location_qty)
      values (jid, r.part, 'site', req.project_id, prev_loc, prev_loc + r.qty);
    perform inv_private.assert_part_ok(r.part);
  end loop;

  if not any_lines then
    delete from public.inventory_journal where id = jid;
    return null;
  end if;
  return jid;
end;
$$;

-- 10. Health check for admins / after an import: lists parts breaking R1 or R2.
create or replace function public.fn_check_stock_invariants()
returns table (part integer, problem text)
language plpgsql security definer set search_path = public, inv_private, pg_temp
as $$
declare r record;
begin
  perform inv_private.require_role('admin');
  for r in select distinct s.pid from (
             select o.part_gcs_id as pid from public.stock_on_hand o
             union select l.part_gcs_id as pid from public.stock_location l) s
  loop
    begin
      perform inv_private.assert_part_ok(r.pid);
    exception when others then
      part := r.pid; problem := sqlerrm; return next;
    end;
  end loop;
end;
$$;

-- 11. Who may call what: signed-in users and the service role only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_stock_transfer(integer,bigint,bigint,integer,text,text,text)',
    'public.fn_move_location(integer,text,bigint,text,bigint,integer,text)',
    'public.fn_record_use(integer,text,bigint,integer,text)',
    'public.fn_apply_count(text,text,jsonb)',
    'public.fn_receive_po_parts(bigint)',
    'public.fn_check_stock_invariants()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

commit;
