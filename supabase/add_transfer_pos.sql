-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT. Run after ownership_location_01_schema.sql (it replaces two of
-- that file's functions) and after add_po_sequences_and_activity.sql.
--
-- Every Stock Transfer now also writes a purchase order between the two entities, in the
-- same step as the transfer itself (if the PO can't be written, the transfer is cancelled):
--
--   Buyer (the PO's entity)   the receiving entity   -> its PO number series
--   Vendor                    the sending entity     -> a vendor named after it, created on first use
--   Line                      the part, the quantity moved, unit cost = the part's Last Cost ($0 if none)
--   Status                    Closed, parts Received. It is a record of a sale that already happened.
--                             Payment stays Unpaid until accounting settles it between the entities.
--   Markup / tax / shipping   0 (nothing is being bought from outside)
--
-- Such a line has inventory_action = 'transfer'. The stock already moved with the transfer, so
-- these lines are never counted again: receiving a PO skips them and they never show as "on order".
--
-- One PO per saved transfer (the Stock Transfer screen saves one part at a time).

begin;

-- 1. A new kind of part line.
alter table public.purchase_request_lines drop constraint if exists purchase_request_lines_inventory_action_check;
alter table public.purchase_request_lines add constraint purchase_request_lines_inventory_action_check
  check (inventory_action in (
    'spare', 'used_immediately', 'consumable', 'transfer',
    'add_existing', 'add_new', 'not_tracked'
  ));

-- 2. The PO writer (private; only the transfer function calls it).
create or replace function inv_private.create_transfer_po(
  p_part integer, p_from bigint, p_to bigint, p_qty integer, p_note text, p_uid bigint)
returns text
language plpgsql set search_path = public, inv_private, pg_temp
as $$
declare
  sender text := inv_private.project_name(p_from);
  receiver text := inv_private.project_name(p_to);
  vendor bigint; code text; yy text; prefix text; seq integer; po_no text; rid bigint;
  cost numeric; part_text text;
begin
  -- The sending entity as a vendor (reuse one that already has its name).
  select id into vendor from public.vendors where lower(name) = lower(sender) order by id limit 1;
  if vendor is null then
    insert into public.vendors (name, notes)
    values (sender, 'Internal vendor, created automatically for stock transfers out of this entity.')
    returning id into vendor;
  end if;

  -- Next PO number for the receiving entity: PO-{code}-{yy}-{seq}, same counter the app uses.
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

  select coalesce(last_cost, 0), coalesce(nullif(trim(description), ''), gcs_part_id)
  into cost, part_text from public.parts where gcs_id = p_part;

  insert into public.purchase_requests (
    project_id, vendor_id, status, po_number, description, notes,
    requested_by, approved_by, issued_by, received_by, closed_by,
    submitted_at, approved_at, issued_at, received_at, closed_at,
    parts_status, markup_rate, tax_rate, shipping_handling, credit
  ) values (
    p_to, vendor, 'closed', po_no, 'Stock transfer: ' || sender || ' → ' || receiver, trim(p_note),
    p_uid, p_uid, p_uid, p_uid, p_uid,
    now(), now(), now(), now(), now(),
    'received', 0, 0, 0, 0
  ) returning id into rid;

  insert into public.purchase_request_lines (
    purchase_request_id, line_type, part_gcs_id, description, quantity, unit_cost, inventory_action)
  values (rid, 'part', p_part, part_text, p_qty, cost, 'transfer');

  insert into public.purchase_request_activity (purchase_request_id, user_id, note)
  values (rid, p_uid, '• Created automatically from a stock transfer (' || sender || ' → ' || receiver || ')');

  return po_no;
end;
$$;

-- 3. Stock Transfer: unchanged except that it now writes the PO too (marked NEW below).
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

  -- NEW: the purchase order between the two entities, and a pointer to it in History.
  po_no := inv_private.create_transfer_po(p_part, p_from, p_to, p_qty, p_note, uid);
  update public.inventory_journal set note = note || ' — ' || po_no where id = jid;
  return jid;
end;
$$;

-- 4. PO receiving: as before, but a transfer line is never added to stock again.
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
      and coalesce(inventory_action, '') not in ('used_immediately', 'consumable', 'transfer')
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

commit;
