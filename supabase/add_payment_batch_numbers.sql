-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT, after add_payment_batches.sql. Safe to repeat.
--
-- Every payment-approval batch gets its own number, assigned by the database: PB-<year>-<running number>, e.g.
-- PB-26-001, PB-26-002 ... PB-27-001 (the year's counter restarts each January, like PO numbers). The supervisor no
-- longer types a name: the number IS the name, and once a batch exists its number, name, approver and date can't be
-- changed. Batches made before this file get a number too (oldest first, per year), and keep their old name.
--
-- Until this is run the app keeps working: a batch is named "Approved invoice batch <date>" and shown with its id.

-- 1. The per-year counter. Only the trigger function below touches it (no policies, so the app can't).
create table if not exists public.payment_batch_sequences (
  year_code text primary key,
  last_seq integer not null default 0
);
alter table public.payment_batch_sequences enable row level security;

-- 2. The number on each batch.
alter table public.invoice_payment_batches add column if not exists batch_number text;
create unique index if not exists invoice_payment_batches_batch_number_key
  on public.invoice_payment_batches (batch_number) where batch_number is not null;

-- 3. Number the batches that already exist (before the triggers below are in place). Per year, oldest first,
--    carrying on after any number already handed out for that year.
with numbered as (
  select b.id,
         to_char(b.approved_at at time zone 'America/Toronto', 'YY') as yy,
         row_number() over (
           partition by to_char(b.approved_at at time zone 'America/Toronto', 'YY')
           order by b.approved_at, b.id
         ) as rn
    from public.invoice_payment_batches b
   where b.batch_number is null
)
update public.invoice_payment_batches b
   set batch_number = 'PB-' || n.yy || '-' ||
         lpad((n.rn + coalesce((select s.last_seq from public.payment_batch_sequences s where s.year_code = n.yy), 0))::text, 3, '0')
  from numbered n
 where b.id = n.id;

-- 4. The counter carries on from the highest number used in each year.
insert into public.payment_batch_sequences (year_code, last_seq)
select substring(batch_number from '^PB-(\d{2})-'), max(substring(batch_number from '-(\d+)$')::int)
  from public.invoice_payment_batches
 where batch_number ~ '^PB-\d{2}-\d+$'
 group by 1
on conflict (year_code) do update
  set last_seq = greatest(public.payment_batch_sequences.last_seq, excluded.last_seq);

-- 5. A new batch gets the next number (whatever the app sent), and its name is that number. Once numbered, the
--    batch can't be edited.
create or replace function public.fn_payment_batch_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yy text;
  seq integer;
begin
  if tg_op = 'INSERT' then
    yy := to_char(now() at time zone 'America/Toronto', 'YY');
    insert into public.payment_batch_sequences as s (year_code, last_seq)
    values (yy, 1)
    on conflict (year_code) do update set last_seq = s.last_seq + 1
    returning s.last_seq into seq;
    new.batch_number := 'PB-' || yy || '-' || lpad(seq::text, 3, '0');
    new.name := new.batch_number;
    return new;
  end if;

  -- UPDATE: a numbered batch is fixed. (An old one with no number yet may only be given its number.)
  if old.batch_number is not null then
    if new.batch_number is distinct from old.batch_number
       or new.name is distinct from old.name
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'A payment batch''s number, name, approver and date can''t be changed.';
    end if;
  elsif new.name is distinct from old.name
        or new.approved_by is distinct from old.approved_by
        or new.approved_at is distinct from old.approved_at then
    raise exception 'A payment batch''s name, approver and date can''t be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_batch_number on public.invoice_payment_batches;
create trigger trg_payment_batch_number
  before insert or update on public.invoice_payment_batches
  for each row execute function public.fn_payment_batch_number();
