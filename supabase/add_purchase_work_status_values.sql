-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Purchase POs now use their own vocabulary for the work_status column --
-- renamed "PO Status" in the UI -- tracking ordering/receiving a physical
-- part instead of doing a piece of work: not_ordered, ordered,
-- partially_received, received. Service (and Not to Exceed) POs keep the
-- existing not_started/partial/complete values. Purely additive -- widens
-- the existing check constraint, no data changes needed since every
-- existing row is still a valid value under the old vocabulary.

alter table purchase_requests
  drop constraint if exists purchase_requests_work_status_check;

alter table purchase_requests
  add constraint purchase_requests_work_status_check
    check (work_status in (
      'not_started', 'partial', 'complete',
      'not_ordered', 'ordered', 'partially_received', 'received'
    ));

-- Existing Purchase-category rows already have a value under the old
-- vocabulary (defaulted to 'not_started' long before this existed) -- carry
-- those over to their new equivalents so the PO Status dropdown shows a
-- real selection instead of landing on a value that isn't one of its
-- rendered options.
update purchase_requests
set work_status = case work_status
  when 'not_started' then 'not_ordered'
  when 'partial' then 'partially_received'
  when 'complete' then 'received'
  else work_status
end
where po_category = 'purchase';
