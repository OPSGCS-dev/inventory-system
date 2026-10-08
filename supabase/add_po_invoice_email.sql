-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Each PO now says which email address vendors should send invoices to (chosen in the
-- PO draft screen, printed in the instructions at the foot of the PO). The choices are
-- listed in the app (PO_INVOICE_EMAIL_OPTIONS in src/utils.js).
--
-- Null means "the default" (ap@greatcirclesolar.com), which is what every existing PO
-- has been printing, so nothing changes for them.

alter table public.purchase_requests add column if not exists invoice_email text;
