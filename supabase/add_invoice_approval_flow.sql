-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT.
-- Run it after add_po_prepaid.sql (it looks at purchase_requests.prepaid). Safe to repeat.
--
-- The invoice flow becomes:
--   1. Invoice Matching uploads the invoice (and usually the receipt) and matches them
--   2. the requisitioner (whoever raised the PO) reviews and approves the pair      -> reviewed
--   3. a supervisor (the Invoice Approval role) approves it for payment, in batches  -> approved
--   4. accounting (the Payment role) pays it outside the system, then confirms each
--      invoice paid, with the date paid and a reference                              -> paid
--   5. the requisitioner closes the PO
-- Either approver can instead send an invoice back to accounting with a reason (returned_*).
--
-- Invoices already approved before this existed count as reviewed too, so nothing in flight
-- gets stuck: matched invoices that were waiting on approval now wait for the requisitioner.

alter table invoices add column if not exists reviewed boolean not null default false;
alter table invoices add column if not exists reviewed_by bigint references users(id);
alter table invoices add column if not exists reviewed_at timestamptz;

alter table invoices add column if not exists returned_by bigint references users(id);
alter table invoices add column if not exists returned_at timestamptz;
alter table invoices add column if not exists return_reason text;
alter table invoices add column if not exists returned_stage text;

alter table invoices add column if not exists paid_date date;
alter table invoices add column if not exists payment_reference text;

-- Invoices approved under the old flow count as reviewed (done before the guard below exists,
-- so it can't object).
update invoices
set reviewed = true, reviewed_by = approved_by, reviewed_at = approved_at
where approved and not reviewed;

-- The stage order, enforced in the database so a stale page can't skip a step. Only the moment
-- a step is taken (or withdrawn) is checked, so existing rows are never in violation.
create or replace function public.fn_invoice_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_prepaid boolean := false;
begin
  if new.reviewed and not coalesce(old.reviewed, false) then
    begin
      select coalesce(prepaid, false) into is_prepaid from purchase_requests where id = new.purchase_request_id;
    exception when undefined_column then
      is_prepaid := false;
    end;
    if new.matched_receipt_id is null and not coalesce(is_prepaid, false) then
      raise exception 'This invoice has to be matched to a receipt before the requisitioner can review it.' using errcode = 'P0001';
    end if;
  end if;

  if new.approved and not coalesce(old.approved, false) and not new.reviewed then
    raise exception 'The requisitioner has to review this invoice before it can be approved for payment.' using errcode = 'P0001';
  end if;

  if new.paid and not coalesce(old.paid, false) and not new.approved then
    raise exception 'This invoice has to be approved for payment before it can be marked paid.' using errcode = 'P0001';
  end if;

  if coalesce(old.reviewed, false) and not new.reviewed and new.approved then
    raise exception 'This invoice is already approved for payment — take that approval back first.' using errcode = 'P0001';
  end if;

  if coalesce(old.approved, false) and not new.approved and new.paid then
    raise exception 'This invoice is already paid — clear the payment first.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_stage_guard on public.invoices;
create trigger trg_invoice_stage_guard
  before update on public.invoices
  for each row execute function public.fn_invoice_stage_guard();
