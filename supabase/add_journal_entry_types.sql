-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- The History tab's Type column always showed "Adjustment" because every
-- journal-writing action actually inserted entry_type = 'adjustment',
-- regardless of what it was (recording part use, transferring stock between
-- entities, receiving a PO). Widens the check constraint so each of those
-- can use its own entry_type; no existing rows need to change since
-- 'adjustment'/'count' are still valid values for what already happened.

alter table inventory_journal
  drop constraint if exists inventory_journal_entry_type_check;

alter table inventory_journal
  add constraint inventory_journal_entry_type_check
    check (entry_type in (
      'adjustment', 'location_adjustment', 'use', 'transfer', 'count', 'po_received'
    ));

-- Retroactively reclassify existing rows that are identifiable from their
-- note text (each action wrote a distinct, recognizable note prefix even
-- though they all shared entry_type = 'adjustment') -- so History shows the
-- real action for past entries too, not just new ones. The "Stock
-- transfer: "/"Part use: " prefixes are also stripped since the Type column
-- says that now.
update inventory_journal
set entry_type = 'po_received'
where entry_type = 'adjustment' and note like 'PO %' and note like '%received from%';

update inventory_journal
set entry_type = 'transfer', note = regexp_replace(note, '^Stock transfer: ', '')
where entry_type = 'adjustment' and note like 'Stock transfer:%';

update inventory_journal
set entry_type = 'use', note = regexp_replace(note, '^Part use: ', '')
where entry_type = 'adjustment' and note like 'Part use:%';
