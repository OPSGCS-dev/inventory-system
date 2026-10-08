-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Lets a PO be linked to an existing ticket by the ticket's number, from either app:
--   * in this app (PO view > Ticket > Link ticket), by typing the ticket number, and
--   * in the ticket system (ticket page > Link existing PO).
-- A ticket is identified by the code it shows (TK-06-26-001 -> '06-26-001') or, for older
-- tickets, its plain number (TK-00042 -> 42). A PO created from a ticket's "Create Purchase
-- Rec" button keeps working as before (it stores the ticket's id and number).
--
-- Run this BEFORE the matching ticket-system release goes live: the ticket page looks POs up
-- by this column too (it falls back to the old lookup if the column is missing, but linking
-- from the ticket page needs it).

alter table public.purchase_requests add column if not exists ticket_system_ticket_code text;

create index if not exists purchase_requests_ticket_system_ticket_code_idx
  on public.purchase_requests (ticket_system_ticket_code);
create index if not exists purchase_requests_ticket_system_ticket_number_idx
  on public.purchase_requests (ticket_system_ticket_number);
