-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Best run after the other purchase-order SQL files (add_po_prepaid, add_invoice_approval_flow,
-- add_payment_batches): it records whichever of those tables exist, and picks up the others if
-- you run this file again later.
--
-- A permanent audit trail for purchase orders: one row in po_history for every step in a PO's
-- life -- who, when, what, and exactly which fields changed (old -> new). It is written by
-- database triggers on the PO tables themselves, so it catches every way a PO can change (the
-- app, an import, a script) and does not depend on the browser remembering to log anything.
--
-- What is recorded
--   POs ................ created, edited, submitted, approved, rejected, held, resumed, issued, work
--                        and payment status changes, closed, voided, deleted (with what was in it)
--   Line items ......... added, changed, removed
--   Invoices ........... added, matched to a receipt, reviewed, approved for payment, sent back,
--                        resubmitted, paid (date + reference), payment cleared, edited, deleted
--   Receipts ........... added, deleted
--   Payment batches .... created
--   Vendors ............ requested, approved, rejected, edited, deleted
--   Documents .......... PO PDF downloaded, vendor email drafted (logged by the app, but stamped
--                        with the real user and time by the database)
--
-- How it is protected
--   * Nobody can insert, change or delete a row from the app, the API keys or the Admin tab: only
--     the triggers write (insert/update/delete/truncate are revoked and refused).
--   * Each row carries a hash of the row before it, so any later change or removal -- even by someone
--     with full database access -- breaks the chain. fn_verify_po_history() (the "Verify integrity"
--     button on the PO History tab) walks the chain and reports the first row that doesn't fit.
--   * The record survives deleting the PO it is about (no foreign keys), and each row keeps the PO
--     number, entity, vendor and person's name as they were at the time.
--   * Reading it is limited, in the database, to admins, Invoice Matching, Payment Approval, Payment,
--     Purchase Rec Approval and PO Issue.
--   * A PO can only be deleted while it is a draft; anything later has to be voided (which keeps it).
--
-- History starts from the moment this is run, plus the PO activity notes that already exist (copied
-- in once, shown as "From the old activity log"). A change made from the SQL editor or a script (no
-- signed-in user) is recorded with no user, shown as "System".

-- ---------------------------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------------------------

create table if not exists public.po_history (
  id bigint generated always as identity primary key,
  seq bigint not null,                      -- position in the hash chain (set by the trigger)
  happened_at timestamptz not null default now(),
  actor_id bigint,                          -- no foreign keys on purpose: the record outlives what it is about
  actor_name text,
  category text not null,                   -- request | approval | issue | receiving | invoicing | payment | closeout | vendor | documents | legacy
  event text not null,                      -- e.g. submitted, invoice_paid (labels live in the app)
  source_table text not null,               -- which table the change was in
  record_id bigint,                         -- id of the line / invoice / receipt / vendor / batch / PO changed
  purchase_request_id bigint,
  po_number text,
  entity_id bigint,
  entity_name text,
  vendor_id bigint,
  vendor_name text,
  invoice_number text,
  -- insert: {field: {new}}   update: {field: {old, new}}   delete: {field: {old}}
  changes jsonb not null default '{}'::jsonb,
  note text,
  prev_hash text not null,
  row_hash text not null
);

create unique index if not exists po_history_seq_idx on public.po_history (seq);
create index if not exists po_history_happened_idx on public.po_history (happened_at desc);
create index if not exists po_history_request_idx on public.po_history (purchase_request_id, seq);
create index if not exists po_history_actor_idx on public.po_history (actor_id);
create index if not exists po_history_category_idx on public.po_history (category, event);
create index if not exists po_history_po_number_idx on public.po_history (po_number);
create index if not exists po_history_invoice_number_idx on public.po_history (invoice_number);

-- ---------------------------------------------------------------------------------------------
-- Who may read it (enforced here, not just hidden in the app)
-- ---------------------------------------------------------------------------------------------

create or replace function public.can_view_po_history()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.active
      and u.roles && array['admin', 'invoice_matching', 'invoice_approval', 'payment', 'purchase_rec_approval', 'po_issue']::text[]
  );
$$;
revoke all on function public.can_view_po_history() from public, anon;
grant execute on function public.can_view_po_history() to authenticated, service_role;

alter table public.po_history enable row level security;

drop policy if exists "po history read" on public.po_history;
create policy "po history read" on public.po_history for select to authenticated using (public.can_view_po_history());
-- No insert / update / delete policies on purpose: only the triggers below write.

revoke insert, update, delete, truncate on public.po_history from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Append-only, and chained: each row's hash covers the row before it
-- ---------------------------------------------------------------------------------------------

create or replace function public.fn_po_history_row_hash(h public.po_history)
returns text
language sql
stable
as $$
  select encode(
    sha256(convert_to(
      concat_ws('|',
        h.prev_hash,
        h.seq,
        to_char(h.happened_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        coalesce(h.actor_id::text, ''),
        coalesce(h.actor_name, ''),
        h.category,
        h.event,
        h.source_table,
        coalesce(h.record_id::text, ''),
        coalesce(h.purchase_request_id::text, ''),
        coalesce(h.po_number, ''),
        coalesce(h.entity_id::text, ''),
        coalesce(h.entity_name, ''),
        coalesce(h.vendor_id::text, ''),
        coalesce(h.vendor_name, ''),
        coalesce(h.invoice_number, ''),
        h.changes::text,
        coalesce(h.note, '')
      ), 'UTF8')),
    'hex');
$$;

create or replace function public.fn_po_history_chain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  last_seq bigint;
  last_hash text;
begin
  -- One writer at a time, so the chain has a single, unambiguous order.
  perform pg_advisory_xact_lock(724001);
  select h.seq, h.row_hash into last_seq, last_hash from public.po_history h order by h.seq desc limit 1;
  new.seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := coalesce(last_hash, 'genesis');
  new.row_hash := public.fn_po_history_row_hash(new);
  return new;
end;
$$;
revoke all on function public.fn_po_history_chain() from public, anon, authenticated;

drop trigger if exists trg_po_history_chain on public.po_history;
create trigger trg_po_history_chain
  before insert on public.po_history
  for each row execute function public.fn_po_history_chain();

create or replace function public.fn_po_history_refuse_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The PO history is append-only: rows cannot be changed or removed.' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_po_history_no_change on public.po_history;
create trigger trg_po_history_no_change
  before update or delete on public.po_history
  for each row execute function public.fn_po_history_refuse_change();

drop trigger if exists trg_po_history_no_truncate on public.po_history;
create trigger trg_po_history_no_truncate
  before truncate on public.po_history
  for each statement execute function public.fn_po_history_refuse_change();

-- Walks the whole chain. Returns { ok, checked, bad_seq, reason }: ok is true when every row's
-- hash matches its contents and links to the row before it, with no gaps.
create or replace function public.fn_verify_po_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.po_history;
  expected_prev text := 'genesis';
  expected_seq bigint := 1;
  n bigint := 0;
begin
  if not public.can_view_po_history() then
    raise exception 'You do not have access to the PO history.' using errcode = 'P0001';
  end if;
  for r in select * from public.po_history order by seq loop
    if r.seq <> expected_seq then
      return jsonb_build_object('ok', false, 'checked', n, 'bad_seq', expected_seq, 'reason', 'A row is missing from the chain here.');
    end if;
    if r.prev_hash <> expected_prev then
      return jsonb_build_object('ok', false, 'checked', n, 'bad_seq', r.seq, 'reason', 'This row does not link to the one before it.');
    end if;
    if r.row_hash <> public.fn_po_history_row_hash(r) then
      return jsonb_build_object('ok', false, 'checked', n, 'bad_seq', r.seq, 'reason', 'This row''s contents were changed after it was written.');
    end if;
    expected_prev := r.row_hash;
    expected_seq := expected_seq + 1;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'checked', n);
end;
$$;
revoke all on function public.fn_verify_po_history() from public, anon;
grant execute on function public.fn_verify_po_history() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- The recorder: one function on every PO table
-- ---------------------------------------------------------------------------------------------

create or replace function public.fn_po_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid bigint;
  uname text;
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  src jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  k text;
  chg jsonb := '{}'::jsonb;
  ev text;
  cat text;
  rec bigint := (src ->> 'id')::bigint;
  pid bigint;
  pnum text;
  ent_id bigint;
  ven_id bigint;
  ent text;
  ven text;
  inv_no text;
  note_text text;
  parent record;
begin
  select u.id, coalesce(nullif(u.display_name, ''), u.name) into uid, uname
  from public.users u where u.auth_user_id = auth.uid();

  -- What changed, field by field (same shape as parts_history).
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      continue when k in ('updated_at', 'created_at');
      if o -> k is distinct from n -> k then
        chg := chg || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
      end if;
    end loop;
    if chg = '{}'::jsonb then return null; end if;   -- nothing actually changed
  elsif tg_op = 'INSERT' then
    for k in select jsonb_object_keys(n) loop
      continue when k in ('updated_at', 'created_at') or n -> k = 'null'::jsonb;
      chg := chg || jsonb_build_object(k, jsonb_build_object('new', n -> k));
    end loop;
  else
    for k in select jsonb_object_keys(o) loop
      continue when k in ('updated_at', 'created_at') or o -> k = 'null'::jsonb;
      chg := chg || jsonb_build_object(k, jsonb_build_object('old', o -> k));
    end loop;
  end if;

  -- Which PO this is about, and the names as they are right now.
  if tg_table_name = 'purchase_requests' then
    pid := rec;
    pnum := src ->> 'po_number';
    ent_id := (src ->> 'project_id')::bigint;
    ven_id := (src ->> 'vendor_id')::bigint;
  elsif tg_table_name in ('purchase_request_lines', 'invoices', 'receipts') then
    pid := (src ->> 'purchase_request_id')::bigint;
    select pr.po_number, pr.project_id, pr.vendor_id into parent from public.purchase_requests pr where pr.id = pid;
    if not found then
      -- The PO itself is going away (a cascade): its own delete entry records what it held.
      if tg_op = 'DELETE' then return old; end if;
    else
      pnum := parent.po_number; ent_id := parent.project_id; ven_id := parent.vendor_id;
    end if;
  elsif tg_table_name = 'vendors' then
    ven_id := rec;
  end if;
  if ent_id is not null then select p.name into ent from public.projects p where p.id = ent_id; end if;
  if ven_id is not null then select v.name into ven from public.vendors v where v.id = ven_id; end if;

  -- What kind of event it was.
  if tg_table_name = 'purchase_requests' then
    if tg_op = 'INSERT' then
      ev := 'po_created'; cat := 'request';
    elsif tg_op = 'DELETE' then
      ev := 'po_deleted'; cat := 'closeout';
      chg := chg || jsonb_build_object('_held', jsonb_build_object(
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('type', l.line_type, 'description', l.description, 'quantity', l.quantity, 'unit_cost', l.unit_cost)), '[]'::jsonb)
                  from public.purchase_request_lines l where l.purchase_request_id = old.id),
        'invoices', (select coalesce(jsonb_agg(jsonb_build_object('invoice_number', i.invoice_number, 'amount', i.amount)), '[]'::jsonb)
                     from public.invoices i where i.purchase_request_id = old.id),
        'receipts', (select count(*) from public.receipts r where r.purchase_request_id = old.id)));
    elsif o ->> 'status' is distinct from n ->> 'status' then
      ev := case n ->> 'status'
        when 'submitted' then 'submitted' when 'approved' then 'approved' when 'rejected' then 'rejected'
        when 'issued' then 'issued' when 'closed' then 'closed' when 'voided' then 'voided'
        when 'draft' then 'returned_to_draft' else 'status_changed' end;
      cat := case n ->> 'status'
        when 'submitted' then 'request' when 'draft' then 'request'
        when 'approved' then 'approval' when 'rejected' then 'approval'
        when 'issued' then 'issue' when 'closed' then 'closeout' when 'voided' then 'closeout'
        else 'request' end;
    elsif o ->> 'on_hold' is distinct from n ->> 'on_hold' then
      ev := case when coalesce((n ->> 'on_hold')::boolean, false) then 'held' else 'resumed' end; cat := 'approval';
    elsif o ->> 'parts_status' is distinct from n ->> 'parts_status' or o ->> 'service_status' is distinct from n ->> 'service_status' then
      ev := 'work_status_changed'; cat := 'receiving';
    elsif o ->> 'payment_status' is distinct from n ->> 'payment_status' then
      ev := 'payment_status_changed'; cat := 'payment';
    elsif o ->> 'prepaid' is distinct from n ->> 'prepaid' then
      ev := 'prepaid_changed'; cat := 'invoicing';
    else
      ev := 'edited'; cat := 'request';
    end if;

  elsif tg_table_name = 'purchase_request_lines' then
    cat := 'request';
    ev := case tg_op when 'INSERT' then 'line_added' when 'DELETE' then 'line_removed' else 'line_changed' end;
    -- Name the line, so a change to just its price still says which line it was.
    note_text := coalesce(nullif(src ->> 'description', ''), nullif(src ->> 'new_part_name', ''), 'Part ' || (src ->> 'part_gcs_id'), 'Line');

  elsif tg_table_name = 'invoices' then
    inv_no := src ->> 'invoice_number';
    if tg_op = 'INSERT' then ev := 'invoice_added'; cat := 'invoicing';
    elsif tg_op = 'DELETE' then ev := 'invoice_deleted'; cat := 'invoicing';
    elsif o ->> 'paid' is distinct from n ->> 'paid' then
      ev := case when coalesce((n ->> 'paid')::boolean, false) then 'invoice_paid' else 'payment_cleared' end; cat := 'payment';
    elsif o ->> 'returned_at' is distinct from n ->> 'returned_at' then
      ev := case when n ->> 'returned_at' is not null then 'invoice_returned' else 'invoice_resubmitted' end; cat := 'invoicing';
    elsif o ->> 'approved' is distinct from n ->> 'approved' then
      ev := case when coalesce((n ->> 'approved')::boolean, false) then 'invoice_approved_for_payment' else 'payment_approval_withdrawn' end; cat := 'approval';
    elsif o ->> 'reviewed' is distinct from n ->> 'reviewed' then
      ev := case when coalesce((n ->> 'reviewed')::boolean, false) then 'invoice_reviewed' else 'review_withdrawn' end; cat := 'approval';
    elsif o ->> 'matched_receipt_id' is distinct from n ->> 'matched_receipt_id' then
      ev := case when n ->> 'matched_receipt_id' is not null then 'invoice_matched' else 'invoice_unmatched' end; cat := 'invoicing';
    else
      ev := 'invoice_edited'; cat := 'invoicing';
    end if;

  elsif tg_table_name = 'receipts' then
    cat := 'invoicing';
    ev := case tg_op when 'INSERT' then 'receipt_added' when 'DELETE' then 'receipt_deleted' else 'receipt_edited' end;
    note_text := src ->> 'file_name';

  elsif tg_table_name = 'invoice_payment_batches' then
    cat := 'approval';
    ev := case tg_op when 'INSERT' then 'payment_batch_created' when 'DELETE' then 'payment_batch_removed' else 'payment_batch_edited' end;
    note_text := src ->> 'name';

  elsif tg_table_name = 'vendors' then
    cat := 'vendor';
    if tg_op = 'INSERT' then
      ev := case when n ->> 'approval_status' = 'pending' then 'vendor_requested' else 'vendor_added' end;
    elsif tg_op = 'DELETE' then
      ev := 'vendor_deleted';
    elsif o ->> 'approval_status' is distinct from n ->> 'approval_status' then
      ev := case n ->> 'approval_status' when 'approved' then 'vendor_approved' when 'rejected' then 'vendor_rejected' else 'vendor_status_changed' end;
    elsif o ->> 'active' is distinct from n ->> 'active' then
      ev := case when coalesce((n ->> 'active')::boolean, true) then 'vendor_reactivated' else 'vendor_deactivated' end;
    else
      ev := 'vendor_edited';
    end if;
    ven := coalesce(ven, src ->> 'name');
  end if;

  insert into public.po_history (
    actor_id, actor_name, category, event, source_table, record_id, purchase_request_id, po_number,
    entity_id, entity_name, vendor_id, vendor_name, invoice_number, changes, note
  ) values (
    uid, uname, cat, ev, tg_table_name, rec, pid, pnum, ent_id, ent, ven_id, ven, inv_no, chg, note_text
  );

  if tg_op = 'DELETE' then return old; end if;
  return null;
end;
$$;
revoke all on function public.fn_po_audit() from public, anon, authenticated;

-- Only drafts can be deleted; anything past that has to be voided, which keeps the PO on file.
create or replace function public.fn_po_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from 'draft' then
    raise exception 'Only a draft can be deleted — void the PO instead, which keeps it on file.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

-- The PO's own triggers. (Named so the delete guard runs before the delete is recorded.)
drop trigger if exists trg_a_po_delete_guard on public.purchase_requests;
create trigger trg_a_po_delete_guard
  before delete on public.purchase_requests
  for each row execute function public.fn_po_delete_guard();

drop trigger if exists trg_po_audit_delete on public.purchase_requests;
create trigger trg_po_audit_delete
  before delete on public.purchase_requests
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit on public.purchase_requests;
create trigger trg_po_audit
  after insert or update on public.purchase_requests
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit on public.purchase_request_lines;
create trigger trg_po_audit
  after insert or update or delete on public.purchase_request_lines
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit on public.invoices;
create trigger trg_po_audit
  after insert or update or delete on public.invoices
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit on public.receipts;
create trigger trg_po_audit
  after insert or update or delete on public.receipts
  for each row execute function public.fn_po_audit();

drop trigger if exists trg_po_audit on public.vendors;
create trigger trg_po_audit
  after insert or update or delete on public.vendors
  for each row execute function public.fn_po_audit();

-- Payment batches only exist once add_payment_batches.sql has been run.
do $$
begin
  if to_regclass('public.invoice_payment_batches') is not null then
    drop trigger if exists trg_po_audit on public.invoice_payment_batches;
    create trigger trg_po_audit
      after insert or update or delete on public.invoice_payment_batches
      for each row execute function public.fn_po_audit();
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Document events the database can't see happening (a PO PDF downloaded, a vendor email drafted)
-- ---------------------------------------------------------------------------------------------

create or replace function public.fn_log_po_event(p_request_id bigint, p_event text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid bigint;
  uname text;
  pr record;
  ent text;
  ven text;
begin
  if p_event not in ('po_pdf_downloaded', 'po_email_drafted') then
    raise exception 'Unknown PO event.' using errcode = 'P0001';
  end if;
  select u.id, coalesce(nullif(u.display_name, ''), u.name) into uid, uname
  from public.users u where u.auth_user_id = auth.uid() and u.active;
  if uid is null then
    raise exception 'You must be signed in.' using errcode = 'P0001';
  end if;
  select * into pr from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'That PO does not exist.' using errcode = 'P0001';
  end if;
  select p.name into ent from public.projects p where p.id = pr.project_id;
  select v.name into ven from public.vendors v where v.id = pr.vendor_id;
  insert into public.po_history (
    actor_id, actor_name, category, event, source_table, record_id, purchase_request_id, po_number,
    entity_id, entity_name, vendor_id, vendor_name, note
  ) values (
    uid, uname, 'documents', p_event, 'purchase_requests', pr.id, pr.id, pr.po_number,
    pr.project_id, ent, pr.vendor_id, ven, nullif(left(p_note, 500), '')
  );
end;
$$;
revoke all on function public.fn_log_po_event(bigint, text, text) from public, anon;
grant execute on function public.fn_log_po_event(bigint, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- The notes already in each PO's activity log, copied in once so the history is not empty
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.po_history where source_table = 'purchase_request_activity') then
    insert into public.po_history (
      happened_at, actor_id, actor_name, category, event, source_table, record_id, purchase_request_id,
      po_number, entity_id, entity_name, vendor_id, vendor_name, note
    )
    select
      a.created_at, a.user_id, coalesce(nullif(u.display_name, ''), u.name), 'legacy', 'activity_note',
      'purchase_request_activity', a.id, a.purchase_request_id,
      pr.po_number, pr.project_id, p.name, pr.vendor_id, v.name, a.note
    from public.purchase_request_activity a
    left join public.users u on u.id = a.user_id
    left join public.purchase_requests pr on pr.id = a.purchase_request_id
    left join public.projects p on p.id = pr.project_id
    left join public.vendors v on v.id = pr.vendor_id
    order by a.created_at, a.id;
  end if;
end $$;
