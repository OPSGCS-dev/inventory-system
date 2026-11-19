-- Lets an admin delete a VOIDED purchase order from the list (the app only shows the Delete button to admins).
-- Before this, only drafts could be deleted (add_po_history.sql). Run after add_po_history.sql; safe to re-run.
--
-- A voided PO can't have an approved or paid invoice (the app refuses to void one that does), so what goes is its lines,
-- unapproved invoices, receipts and per-PO activity (all "on delete cascade"). PO History is NOT touched: it has no foreign
-- keys to the PO and keeps every event for it, plus the delete itself (who and when), so the audit trail still shows the PO
-- existed and was voided and deleted. Its PO number is not reused.
--
-- Anything else (submitted, approved, issued, closed) still has to be voided first.
create or replace function public.fn_po_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status not in ('draft', 'voided') then
    raise exception 'Only a draft or a voided PO can be deleted — void the PO first, which keeps it on file.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
