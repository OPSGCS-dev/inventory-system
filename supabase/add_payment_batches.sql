-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Independent of the other invoice SQL files (it only adds a table and one column).
--
-- A record of each payment-approval batch. When a supervisor approves invoices for payment
-- (My Invoices for Payment Approval), the invoices they approve together become one batch:
-- it has a name (their own, or "Payment run <date>"), who approved it and when. Accounting
-- can then filter the Invoices to Pay list by batch and see how much of each batch is paid.
--
-- Invoices approved before this existed simply have no batch.

create table if not exists public.invoice_payment_batches (
  id bigint generated always as identity primary key,
  name text not null,
  approved_by bigint references public.users (id),
  approved_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists payment_batch_id bigint references public.invoice_payment_batches (id) on delete set null;

create index if not exists invoices_payment_batch_id_idx on public.invoices (payment_batch_id);

-- Same model as the other purchase-order tables: anyone signed in can read and write; which
-- people may approve is decided in the app (the Payment Approval role).
alter table public.invoice_payment_batches enable row level security;

drop policy if exists "payment batches read" on public.invoice_payment_batches;
create policy "payment batches read" on public.invoice_payment_batches
  for select to authenticated using (true);

drop policy if exists "payment batches insert" on public.invoice_payment_batches;
create policy "payment batches insert" on public.invoice_payment_batches
  for insert to authenticated with check (true);

drop policy if exists "payment batches delete" on public.invoice_payment_batches;
create policy "payment batches delete" on public.invoice_payment_batches
  for delete to authenticated using (true);
