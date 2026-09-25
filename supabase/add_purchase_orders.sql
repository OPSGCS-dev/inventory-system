-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a Purchase Order / Purchase Requisition system, starting with parts
-- (service line items are supported too, for later). Workflow:
--
--   Draft -> Submitted -> Approved -> PO Issued -> Received / Completed
--
-- Each purchase_requests row is one requisition/PO, tied to a project and a
-- vendor, tracking who did each step (requested/approved/issued/received)
-- and when. Marking a request "received" adds the ordered part quantities
-- into that project's stock_on_hand and logs it in the existing
-- inventory_journal, exactly like an Inventory Count upload does.
--
-- "users" here is a lightweight named-user list (no passwords) so actions
-- can be attributed to a person -- it sits behind the site's existing
-- password gate, it is not a real authentication system.

create table users (
  id bigint generated always as identity primary key,
  name text not null unique,
  roles text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table vendors (
  id bigint generated always as identity primary key,
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table purchase_requests (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id),
  vendor_id bigint references vendors(id),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'issued', 'received')),
  po_number text,
  notes text,
  requested_by bigint references users(id),
  approved_by bigint references users(id),
  issued_by bigint references users(id),
  received_by bigint references users(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  issued_at timestamptz,
  received_at timestamptz
);

create table purchase_request_lines (
  id bigint generated always as identity primary key,
  purchase_request_id bigint not null references purchase_requests(id) on delete cascade,
  line_type text not null default 'part' check (line_type in ('part', 'service')),
  part_gcs_id integer references parts(gcs_id),
  description text,
  quantity numeric not null default 1,
  unit_cost numeric
);

alter table users enable row level security;
alter table vendors enable row level security;
alter table purchase_requests enable row level security;
alter table purchase_request_lines enable row level security;

-- Permissive policies for now, matching the rest of this project's tables
-- (the publishable/anon key does everything -- there is no real auth yet).
create policy "Allow public read" on users for select using (true);
create policy "Allow public insert" on users for insert with check (true);
create policy "Allow public update" on users for update using (true);
create policy "Allow public delete" on users for delete using (true);

create policy "Allow public read" on vendors for select using (true);
create policy "Allow public insert" on vendors for insert with check (true);
create policy "Allow public update" on vendors for update using (true);
create policy "Allow public delete" on vendors for delete using (true);

create policy "Allow public read" on purchase_requests for select using (true);
create policy "Allow public insert" on purchase_requests for insert with check (true);
create policy "Allow public update" on purchase_requests for update using (true);
create policy "Allow public delete" on purchase_requests for delete using (true);

create policy "Allow public read" on purchase_request_lines for select using (true);
create policy "Allow public insert" on purchase_request_lines for insert with check (true);
create policy "Allow public update" on purchase_request_lines for update using (true);
create policy "Allow public delete" on purchase_request_lines for delete using (true);
