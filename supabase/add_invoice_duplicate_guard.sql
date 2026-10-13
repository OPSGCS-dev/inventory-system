-- Run this once in the Supabase SQL editor (Inventory project). Safe to run again.
-- Run it after add_po_history.sql (the invoice audit trigger there records the reason below).
--
-- Duplicate invoice guard. Paying the same vendor invoice twice is the commonest accounting
-- mistake, so:
--
--   * The same invoice number (ignoring case, spaces and punctuation: "INV-001" = "inv 001") from the
--     same vendor can't be added a second time -- on this PO or any other -- unless the person adding
--     it gives a reason ("this is a separate invoice"). The reason is saved on the invoice and shows in
--     the PO History. Enforced here in the database, so it holds however the invoice is added.
--     Invoices on voided POs don't count (re-uploading a voided PO's invoice onto its replacement is normal).
--   * The same vendor and the same amount within the last 90 days is only a warning in the app
--     (recurring bills are often the same amount). fn_find_duplicate_invoices() is what the app asks.
--
-- Invoices already on file are never touched or blocked: the check runs only when an invoice is
-- added, or its number or PO is changed, so approving and paying existing ones carries on as before.
-- Until this is run the app falls back to its old same-PO warning.

alter table public.invoices add column if not exists duplicate_reason text;

-- "INV-001 " / "inv 001" / "Inv.001" all become "inv001". Null if nothing is left.
create or replace function public.fn_invoice_number_key(n text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(coalesce(n, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;

create index if not exists invoices_number_key_idx on public.invoices (public.fn_invoice_number_key(invoice_number));

-- Invoices from this vendor (any PO) that look like the one about to be added: the same number,
-- or the same amount in the last 90 days. Runs as the signed-in user, who can read every invoice.
create or replace function public.fn_find_duplicate_invoices(
  p_vendor_id bigint,
  p_number text,
  p_amount numeric,
  p_exclude_invoice bigint default null
)
returns table (
  invoice_id bigint,
  purchase_request_id bigint,
  po_number text,
  po_status text,
  invoice_number text,
  amount numeric,
  uploaded_at timestamptz,
  paid boolean,
  same_number boolean
)
language sql
stable
set search_path = public, pg_temp
as $$
  select i.id, i.purchase_request_id, pr.po_number, pr.status, i.invoice_number, i.amount, i.uploaded_at, i.paid,
         coalesce(public.fn_invoice_number_key(p_number) is not null
            and public.fn_invoice_number_key(i.invoice_number) = public.fn_invoice_number_key(p_number), false) as same_number
  from public.invoices i
  join public.purchase_requests pr on pr.id = i.purchase_request_id
  where p_vendor_id is not null
    and pr.vendor_id = p_vendor_id
    and (p_exclude_invoice is null or i.id <> p_exclude_invoice)
    and (
      (public.fn_invoice_number_key(p_number) is not null
         and public.fn_invoice_number_key(i.invoice_number) = public.fn_invoice_number_key(p_number))
      or (p_amount is not null and i.amount = p_amount and i.uploaded_at > now() - interval '90 days')
    )
  order by 9 desc, i.uploaded_at desc
  limit 20;
$$;
revoke all on function public.fn_find_duplicate_invoices(bigint, text, numeric, bigint) from public, anon;
grant execute on function public.fn_find_duplicate_invoices(bigint, text, numeric, bigint) to authenticated;

-- The hard rule. security definer so it sees every invoice whatever the table's row security allows.
create or replace function public.fn_invoice_duplicate_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vid bigint;
  clash record;
begin
  -- Only when an invoice is added or its number / PO changes.
  if tg_op = 'UPDATE'
     and new.invoice_number is not distinct from old.invoice_number
     and new.purchase_request_id is not distinct from old.purchase_request_id then
    return new;
  end if;

  if public.fn_invoice_number_key(new.invoice_number) is null then return new; end if;

  -- A reason given for adding it anyway.
  if length(btrim(coalesce(new.duplicate_reason, ''))) >= 5 then return new; end if;

  select pr.vendor_id into vid from public.purchase_requests pr where pr.id = new.purchase_request_id;
  if vid is null then return new; end if;

  select i.id, i.invoice_number, pr.po_number, pr.status into clash
  from public.invoices i
  join public.purchase_requests pr on pr.id = i.purchase_request_id
  where pr.vendor_id = vid
    and pr.status <> 'voided'
    and i.id is distinct from new.id
    and public.fn_invoice_number_key(i.invoice_number) = public.fn_invoice_number_key(new.invoice_number)
  limit 1;

  if found then
    raise exception 'Invoice # % from this vendor is already on %. If it really is a separate invoice, add it again with a reason.',
      clash.invoice_number, coalesce(clash.po_number, 'a draft PO')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_invoice_duplicate_guard() from public, anon, authenticated;

drop trigger if exists trg_invoice_duplicate_guard on public.invoices;
create trigger trg_invoice_duplicate_guard
  before insert or update on public.invoices
  for each row execute function public.fn_invoice_duplicate_guard();
