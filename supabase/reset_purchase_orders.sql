-- ONE-OFF CLEAN-UP, NOT A MIGRATION. Run it in the Supabase SQL editor IN THE INVENTORY PROJECT, and only when you
-- really want every purchase order gone (test/demo data before a presentation or a launch). IT CANNOT BE UNDONE.
--
-- Deletes:
--   * every purchase order (purchase_requests), with its line items, invoices, receipts and the old per-PO activity feed
--   * every payment batch (invoice_payment_batches)
--   * the whole PO History (po_history), including the tamper-proof chain -- the log starts again from empty
--   * the PO number counters, so the next PO for each entity is -001 again, and the ids (the "ID" column) start at 1
-- Stock transfers' POs are POs, so they go too.
--
-- Keeps (not touched): parts, stock counts and locations, the inventory History (stock movements stay, even those from
-- received POs), entities, vendors (including the "internal vendors" stock transfers created), users and roles, budget
-- categories, suggestions, settings.
--
-- NOT done here: the uploaded PDFs in Storage (buckets quotes, invoices, receipts) are not deleted by this -- they would just
-- be left behind, unreferenced. Empty those three buckets from the Supabase dashboard (Storage) if you want them gone.
-- Also: tickets in the ticket system that were linked to a PO will still show that link; unlink them there.
--
-- Safety: it does nothing until you change the first line below to true. It runs as one transaction: if anything fails,
-- nothing is deleted. It pauses the PO History protections only for the length of the clean-up and puts them back.

do $$
declare
  yes_delete_every_purchase_order boolean := false;   -- <<< change to true to run

  t text;
  n_po bigint; n_inv bigint; n_rcpt bigint; n_batch bigint; n_hist bigint;
begin
  if not yes_delete_every_purchase_order then
    select count(*) into n_po from public.purchase_requests;
    select count(*) into n_hist from public.po_history;
    raise exception 'Nothing was deleted. This would remove % purchase orders and % PO History rows. Change the first line of the script to true to go ahead.', n_po, n_hist;
  end if;

  select count(*) into n_po from public.purchase_requests;
  select count(*) into n_inv from public.invoices;
  select count(*) into n_rcpt from public.receipts;
  select count(*) into n_batch from public.invoice_payment_batches;
  select count(*) into n_hist from public.po_history;

  -- 1. Pause the triggers on the PO tables (the audit log, the "drafts only" delete guard, the stage guards and
  --    the history's own append-only protection). Foreign-key cascades are not affected.
  foreach t in array array['purchase_requests', 'purchase_request_lines', 'invoices', 'receipts',
                           'invoice_payment_batches', 'purchase_request_activity', 'po_history'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I disable trigger user', t);
    end if;
  end loop;

  -- 2. The purchase orders (lines, invoices, receipts and the activity feed go with them), the batches, the history.
  delete from public.purchase_requests;
  if to_regclass('public.invoice_payment_batches') is not null then delete from public.invoice_payment_batches; end if;
  if to_regclass('public.po_history') is not null then truncate table public.po_history restart identity; end if;
  if to_regclass('public.po_number_sequences') is not null then delete from public.po_number_sequences; end if;

  -- 3. Numbering starts again from 1.
  foreach t in array array['purchase_requests', 'purchase_request_lines', 'invoices', 'receipts',
                           'invoice_payment_batches', 'purchase_request_activity'] loop
    if to_regclass('public.' || t) is not null and pg_get_serial_sequence('public.' || t, 'id') is not null then
      execute format('select setval(%L, 1, false)', pg_get_serial_sequence('public.' || t, 'id'));
    end if;
  end loop;

  -- 4. Put the triggers back.
  foreach t in array array['purchase_requests', 'purchase_request_lines', 'invoices', 'receipts',
                           'invoice_payment_batches', 'purchase_request_activity', 'po_history'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable trigger user', t);
    end if;
  end loop;

  raise notice 'Deleted % purchase orders (with % invoices, % receipts), % payment batches and % PO History rows. Numbering restarts at 1.', n_po, n_inv, n_rcpt, n_batch, n_hist;
end $$;
