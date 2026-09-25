-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a physical location to each stock_on_hand row (who owns it is already
-- the project; this is *where* that owned asset sits): On-Site, Storage, or
-- Barn. Also extends the journal lines table so location changes are
-- archived the same way quantity changes already are.

alter table stock_on_hand add column location text
  check (location in ('On-Site', 'Storage', 'Barn'));

alter table inventory_journal_lines add column previous_location text;
alter table inventory_journal_lines add column new_location text;
