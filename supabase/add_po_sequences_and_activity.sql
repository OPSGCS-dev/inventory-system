-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Two independent additions:
--
-- 1. po_number_sequences: PO numbers used to be derived by scanning
--    existing po_number values for a project+year and taking the max, so
--    deleting a PO freed up its number for reuse. This is a dedicated,
--    append-only counter per (project, year) instead -- once a number is
--    handed out it's never handed out again, even if that PO is later
--    deleted. Seeded from whatever's already been issued so numbers stay
--    continuous across the cutover. Note: any gap already created by a
--    deletion *before* this migration runs can't be recovered retroactively
--    (the deleted row's number is simply gone) -- this only guarantees no
--    reuse from this point forward.
--
-- 2. purchase_request_activity: a compact, append-only activity log per PO
--    (one row per save/action, same "• bullet list of what changed" shape
--    ticket-system's ticket_updates already uses) -- covers things the
--    fixed timeline (Requested/Approved/Issued/Completed/Closed) doesn't,
--    like markup/credit/category edits, holds, and invoice/receipt actions.

create table if not exists po_number_sequences (
  project_id bigint not null references projects(id) on delete cascade,
  year_code text not null,
  last_seq integer not null default 0,
  primary key (project_id, year_code)
);

alter table po_number_sequences enable row level security;

drop policy if exists "Allow public read" on po_number_sequences;
create policy "Allow public read" on po_number_sequences for select using (true);
drop policy if exists "Allow public insert" on po_number_sequences;
create policy "Allow public insert" on po_number_sequences for insert with check (true);
drop policy if exists "Allow public update" on po_number_sequences;
create policy "Allow public update" on po_number_sequences for update using (true);

insert into po_number_sequences (project_id, year_code, last_seq)
select
  pr.project_id,
  substring(pr.po_number from '-(\d{2})-\d{3}$') as year_code,
  max((substring(pr.po_number from '-(\d{3})$'))::int) as last_seq
from purchase_requests pr
where pr.po_number ~ '-\d{2}-\d{3}$'
group by pr.project_id, substring(pr.po_number from '-(\d{2})-\d{3}$')
on conflict (project_id, year_code)
do update set last_seq = greatest(po_number_sequences.last_seq, excluded.last_seq);

create table if not exists purchase_request_activity (
  id bigint generated always as identity primary key,
  purchase_request_id bigint not null references purchase_requests(id) on delete cascade,
  user_id bigint references users(id),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists purchase_request_activity_request_id_idx
  on purchase_request_activity(purchase_request_id);

alter table purchase_request_activity enable row level security;

drop policy if exists "Allow public read" on purchase_request_activity;
create policy "Allow public read" on purchase_request_activity for select using (true);
drop policy if exists "Allow public insert" on purchase_request_activity;
create policy "Allow public insert" on purchase_request_activity for insert with check (true);
