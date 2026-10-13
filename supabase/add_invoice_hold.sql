-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_invoice_approval_flow.sql. Then re-run add_po_history.sql so the PO History
-- records "Invoice put on hold" / "Invoice released" by name (until then they show as "Invoice edited").
--
-- Lets a supervisor (the Payment Approval role) put an invoice ON HOLD while it waits for payment
-- approval, or after it was approved but before accounting has paid it -- say, while a query with
-- the vendor is sorted out. A hold is a pause, not a rejection:
--   * the invoice stays where it is (still approved if it was), but it can't be approved for
--     payment or confirmed paid until it is released;
--   * a reason is required, and who/when are recorded (held_by / held_at / hold_reason);
--   * the supervisor (or an admin) releases it, and it carries on as before;
--   * sending the invoice back to accounting clears the hold.
-- Enforced here in the database as well as in the app.

alter table public.invoices add column if not exists held_by bigint references public.users(id);
alter table public.invoices add column if not exists held_at timestamptz;
alter table public.invoices add column if not exists hold_reason text;

create or replace function public.fn_invoice_hold_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Putting a hold on: needs a reason, an invoice that has been through the requisitioner, and not yet paid.
  if new.held_at is not null and old.held_at is null then
    if length(btrim(coalesce(new.hold_reason, ''))) < 3 then
      raise exception 'A reason is required to put an invoice on hold.' using errcode = 'P0001';
    end if;
    if new.paid then
      raise exception 'This invoice is already paid, so it can''t be put on hold.' using errcode = 'P0001';
    end if;
    if not new.reviewed then
      raise exception 'Only an invoice that is waiting on payment approval, or approved and unpaid, can be put on hold.' using errcode = 'P0001';
    end if;
  end if;

  -- While it is held it can't move on to the next step.
  if new.held_at is not null then
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

drop trigger if exists trg_invoice_hold_guard on public.invoices;
create trigger trg_invoice_hold_guard
  before update on public.invoices
  for each row execute function public.fn_invoice_hold_guard();
