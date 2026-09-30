-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Splits the old 'approve' role into 'purchase_rec_approval' (submitted ->
-- approved) and 'po_issue' (approved -> issued), and the old 'accounting'
-- role into 'invoice_matching' (adding/matching invoices), 'invoice_approval'
-- (approving a matched pair -- now company-wide, no longer tied to whoever
-- approved that PO's original requisition), and 'payment' (marking an
-- invoice paid / setting Payment Status). Adds a standalone 'ticketing' role
-- decoupled from 'purchase_req'. Drops 'receive' (already unused). None of
-- this needs a schema change to `users.roles` itself -- it's a plain
-- text[] with no check constraint -- this file only adds the new
-- user_role_entities table and grants the test admin account every new
-- role so it doesn't lose access.

create table if not exists user_role_entities (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  role text not null,
  project_id bigint not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, project_id)
);

create index if not exists user_role_entities_user_id_idx on user_role_entities(user_id);

alter table user_role_entities enable row level security;

create policy "Allow public read" on user_role_entities for select using (true);
create policy "Allow public insert" on user_role_entities for insert with check (true);
create policy "Allow public update" on user_role_entities for update using (true);
create policy "Allow public delete" on user_role_entities for delete using (true);

-- Test data only (per the user's own note) -- everyone else can be
-- reassigned manually from the Users tab. Keeps support@ fully capable
-- through the role split rather than mapping every existing account.
update users
set roles = (
  select array_agg(distinct role_value)
  from unnest(
    roles || array[
      'admin', 'inventory', 'ticketing', 'purchase_req',
      'purchase_rec_approval', 'po_issue',
      'invoice_matching', 'invoice_approval', 'payment'
    ]
  ) as role_value
)
where name = 'support@greatcirclesolar.com';
