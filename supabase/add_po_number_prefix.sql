-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- PO numbers now get a "PO-" prefix baked in when generated (see
-- computeNextPoNumber in src/App.jsx), matching ticket-system's tickets
-- getting a "TK-" prefix on the same {code}-{yy}-{seq} convention. This
-- backfills existing PO numbers ("06-26-001") to match ("PO-06-26-001") so
-- old and new POs look consistent -- purely cosmetic, doesn't touch the
-- {code}-{yy}-{seq} part that computeNextPoNumber's sequence-lookup parses.

update purchase_requests
set po_number = 'PO-' || po_number
where po_number is not null
  and po_number not like 'PO-%';
