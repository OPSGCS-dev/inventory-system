-- A PO can be for several of an entity's sites at once (e.g. Firelight Solar rooftops): the PO form gets a
-- "Multiple sites" box and the PO says "Multiple sites". Run any time after add_sub_projects.sql / add_po_history.sql;
-- safe to re-run.
--
-- purchase_requests.multi_sites holds the chosen sites as a JSON list [{"id": 12, "name": "Site name"}, ...] (the names are
-- saved with it so the PO reads the same if a site is renamed later). It is null for an ordinary PO, and then
-- sub_project_id is used exactly as before; for a multi-site PO sub_project_id is left empty.
-- The PO History trigger picks the new field up by itself (shown as "Multiple sites").
alter table public.purchase_requests add column if not exists multi_sites jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_multi_sites_is_list') then
    alter table public.purchase_requests
      add constraint purchase_requests_multi_sites_is_list
      check (multi_sites is null or (jsonb_typeof(multi_sites) = 'array' and jsonb_array_length(multi_sites) >= 2));
  end if;
end $$;
