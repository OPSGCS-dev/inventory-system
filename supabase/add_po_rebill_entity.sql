-- Run this once in the Inventory project's Supabase SQL editor (any time after add_po_print_fields.sql, which added
-- purchase_requests.chargeable_expense, and add_projects_layer.sql).
--
-- Re-billing: a PO marked "Chargeable Expense" is re-billed to another entity, and then counts against THAT entity's
-- budget (Budget tab) instead of the entity that issued it.
--
--   projects.can_rebill               Admin > Entities > "Can re-bill expenses". Only these entities' POs can be marked
--                                     Chargeable Expense. Ticked here for Firelight Operations LP (FLOPS); tick Firelight
--                                     Solar LP (or any other) in Admin if it re-bills too. Ground-mount entities don't.
--   purchase_requests.rebill_project_id  the entity a chargeable PO is re-billed to (empty = not re-billed / not chosen)
--
-- Existing chargeable POs have no entity chosen, so they stay on the issuing entity's budget until someone opens the
-- PO and picks one. Until this file is run the Chargeable box shows for every entity as before and nothing is re-billed.

alter table projects add column if not exists can_rebill boolean not null default false;

update projects set can_rebill = true
 where name ilike 'Firelight Operations%' and can_rebill = false;

-- Deliberately NOT a foreign key: a second link from purchase_requests to projects would make the app's
-- "projects(*)" embeds (and the ticket system's) ambiguous and break every PO load.
alter table purchase_requests add column if not exists rebill_project_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_rebill_not_self') then
    alter table purchase_requests
      add constraint purchase_requests_rebill_not_self
      check (rebill_project_id is null or rebill_project_id <> project_id);
  end if;
end $$;

notify pgrst, 'reload schema';
