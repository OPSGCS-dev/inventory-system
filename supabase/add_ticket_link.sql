-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Links a purchase request back to the ticket-system ticket it was created
-- from, via that ticket's "Create Purchase Rec" button -- not a real foreign
-- key, since ticket-system is a different Supabase project (same pattern as
-- ticket-system's projects.inventory_entity_id/inventory_sub_project_id).
-- ticket_system_ticket_number is stored alongside the id purely so this app
-- can display "TK-00042" without a live cross-project lookup.

alter table purchase_requests add column if not exists ticket_system_ticket_id uuid;
alter table purchase_requests add column if not exists ticket_system_ticket_number integer;

create index if not exists purchase_requests_ticket_system_ticket_id_idx
  on purchase_requests(ticket_system_ticket_id);
