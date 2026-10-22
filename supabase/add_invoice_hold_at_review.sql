-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_invoice_hold.sql. Nothing needs re-running in add_po_history.sql: the existing
-- "Invoice put on hold" / "Invoice released" history events already cover it.
--
-- Extends the invoice hold (add_invoice_hold.sql) one step earlier: the requisitioner can now put an
-- invoice on hold while it is waiting for THEIR review, the same way the supervisor can at payment
-- approval. A held invoice can't be approved by the requisitioner until it is released (and, as
-- before, can't be approved for payment or marked paid while held). Sending it back to accounting
-- still clears the hold. Who can hold / release is decided in the app; this file is the database's
-- own check of what state an invoice must be in.

create or replace function public.fn_invoice_hold_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_prepaid boolean;
begin
  -- Putting a hold on: needs a reason, and an invoice that is ready for the requisitioner or already
  -- past them (matched to a receipt, or on a pre-paid PO), not sent back, and not yet paid.
  if new.held_at is not null and old.held_at is null then
    if length(btrim(coalesce(new.hold_reason, ''))) < 3 then
      raise exception 'A reason is required to put an invoice on hold.' using errcode = 'P0001';
    end if;
    if new.paid then
      raise exception 'This invoice is already paid, so it can''t be put on hold.' using errcode = 'P0001';
    end if;
    if new.returned_at is not null then
      raise exception 'This invoice was sent back to accounting, so it can''t be put on hold until it is resubmitted.' using errcode = 'P0001';
    end if;
    select coalesce(pr.prepaid, false) into is_prepaid from public.purchase_requests pr where pr.id = new.purchase_request_id;
    if not (new.reviewed or new.matched_receipt_id is not null or coalesce(is_prepaid, false)) then
      raise exception 'Only an invoice that is waiting on review or payment approval, or approved and unpaid, can be put on hold.' using errcode = 'P0001';
    end if;
  end if;

  -- While it is held it can't move on to the next step.
  if new.held_at is not null then
    if new.reviewed and not coalesce(old.reviewed, false) then
      raise exception 'This invoice is on hold — release it before approving it.' using errcode = 'P0001';
    end if;
    if new.approved and not coalesce(old.approved, false) then
      raise exception 'This invoice is on hold — release it before approving it for payment.' using errcode = 'P0001';
    end if;
    if new.paid and not coalesce(old.paid, false) then
      raise exception 'This invoice is on hold — it can''t be marked paid until the hold is released.' using errcode = 'P0001';
    end if;
  end if;

  -- Releasing it leaves nothing behind.
  if new.held_at is null then
    new.held_by := null;
    new.hold_reason := null;
  end if;
  return new;
end;
$$;
