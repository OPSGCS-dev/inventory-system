-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_transfer_pos.sql.
--
-- The purchase order a Stock Transfer writes between the two entities used to be created already
-- Closed. It now starts at the REQUEST stage (status Requested, with the person who did the
-- transfer as the requester): it has to be taken through the normal process by hand -- approved,
-- issued, received, invoiced, paid and closed.
--
-- The stock itself still moves with the transfer, immediately. The PO's part line is marked
-- inventory_action = 'transfer', so receiving that PO never adds the parts to stock a second
-- time (fn_receive_po_parts skips such lines, and they never show as "on order").
--
-- Transfers made before this was run keep the closed POs they already have.

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

  -- CHANGED: a Requested PO (submitted by the person who did the transfer), not a Closed one.
  -- Nothing after "submitted" is filled in: approval, issue, receiving and closing are still to come.
  insert into public.purchase_requests (
    project_id, vendor_id, status, po_number, description, notes,
    requested_by, submitted_at,
    parts_status, markup_rate, tax_rate, shipping_handling, credit
  ) values (
    p_to, vendor, 'submitted', po_no, 'Stock transfer: ' || sender || ' → ' || receiver, trim(p_note),
    p_uid, now(),
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
