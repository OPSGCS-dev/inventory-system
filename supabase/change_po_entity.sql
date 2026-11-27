-- ONE-OFF FIX, NOT A MIGRATION. Run it in the Supabase SQL editor IN THE INVENTORY PROJECT (sandbox first) when issued POs
-- were put on the wrong Entity and you want to move them to another one, keeping everything else about them.
--
-- What it changes: purchase_requests.project_id (the Entity) -> the entity named below, and nothing else, with two small exceptions:
--   * if the PO was "re-billed to" the entity it is moving to, the re-bill entity is cleared (a PO can't be re-billed to itself);
--   * nothing else is touched -- the PO number, site, vendor, lines, amounts, Project / budget type, budget category, requester,
--     status, vendor-contacted marker, ticket link and activity log all stay as they are.
-- The PO History records "Entity" old -> new for each PO (shown without a person's name, since it was made from the SQL editor).
-- The budget figures follow the entity, so the money moves to the new entity's column on the Budget tab by itself.
--
-- It refuses (and changes NOTHING, for any PO) if any listed PO:
--   * does not exist, or is not Issued;
--   * has an invoice or a receipt uploaded, or has parts marked received / partly received (stock would have been credited
--     to the old entity -- that needs a stock transfer instead);
--   * is on a Project / budget type that the new entity does not belong to (the database's own rule would refuse it).
--
-- How to run: leave dry_run := true and run it -- it only prints, per PO, what it WOULD do. Read the notices, then set
-- dry_run := false and run it again to make the change.

do $$
declare
  request_ids  bigint[] := array[18,19,20,26,27,28,29,30,31,35,36,37,38,48,49,50];  -- <<< the "ID" column of the PO list
  new_entity   text     := 'Firelight Operations LP';                                  -- <<< the entity to move them to
  dry_run      boolean  := true;                                                        -- <<< set to false to actually change them

  new_id bigint; n int; rid bigint; pr record; old_name text; site_name text; site_json jsonb;
  problems text := ''; rebill_id bigint; has_rebill boolean; moved int := 0;
begin
  select count(*) into n from public.projects where lower(name) = lower(trim(new_entity));
  if n = 0 and lower(trim(new_entity)) = 'firelight operations lp' then
    select count(*) into n from public.projects where lower(name) = 'flops';
    if n = 1 then select id into new_id from public.projects where lower(name) = 'flops'; end if;
  elsif n = 1 then
    select id into new_id from public.projects where lower(name) = lower(trim(new_entity));
  end if;
  if new_id is null then raise exception 'Could not find exactly one entity named "%" -- use the name as shown in Admin > Entities.', new_entity; end if;

  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'rebill_project_id') into has_rebill;

  foreach rid in array request_ids loop
    select * into pr from public.purchase_requests where id = rid;
    if not found then problems := problems || format(E'\n  ID %s: no such request.', rid); continue; end if;
    select name into old_name from public.projects where id = pr.project_id;

    if pr.project_id = new_id then
      raise notice 'ID % (%): already on %, skipped.', rid, coalesce(pr.po_number, 'no PO #'), new_entity; continue;
    end if;
    if pr.status is distinct from 'issued' then
      problems := problems || format(E'\n  ID %s (%s): status is "%s", not issued.', rid, coalesce(pr.po_number, 'no PO #'), pr.status);
    end if;
    if exists (select 1 from public.invoices where purchase_request_id = rid) then
      problems := problems || format(E'\n  ID %s (%s): has an invoice uploaded.', rid, pr.po_number);
    end if;
    if exists (select 1 from public.receipts where purchase_request_id = rid) then
      problems := problems || format(E'\n  ID %s (%s): has a receipt uploaded.', rid, pr.po_number);
    end if;
    if pr.parts_status in ('received', 'partially_received') then
      problems := problems || format(E'\n  ID %s (%s): parts are marked %s.', rid, pr.po_number, pr.parts_status);
    end if;
    if pr.program_id is not null and not exists (
         select 1 from public.program_sites ps where ps.program_id = pr.program_id and ps.project_id = new_id) then
      problems := problems || format(E'\n  ID %s (%s): its Project / budget type does not include %s. Add it under Admin first.', rid, pr.po_number, new_entity);
    end if;
  end loop;

  if problems <> '' then
    raise exception E'Nothing was changed. Fix these first:%', problems;
  end if;

  foreach rid in array request_ids loop
    select * into pr from public.purchase_requests where id = rid;
    continue when pr.project_id = new_id;
    select name into old_name from public.projects where id = pr.project_id;

    site_name := null;
    if pr.sub_project_id is not null then
      select to_jsonb(sp) into site_json from public.sub_projects sp where sp.id = pr.sub_project_id;
      site_name := site_json ->> 'name';
      if not coalesce((site_json -> 'also_project_ids') @> to_jsonb(new_id), false) then
        raise notice 'ID %: kept its site "%", which is not (yet) offered to % -- tick it under Admin > Sites > Also available to if you want it in the dropdown.',
          rid, site_name, new_entity;
      end if;
    end if;

    rebill_id := case when has_rebill then (to_jsonb(pr) ->> 'rebill_project_id')::bigint end;

    raise notice 'ID % (%): % -> %   [site kept: %]%', rid, pr.po_number, old_name, new_entity,
      coalesce(site_name, 'none'), case when rebill_id = new_id then '; re-bill entity cleared' else '' end;

    if not dry_run then
      if rebill_id = new_id then
        execute 'update public.purchase_requests set rebill_project_id = null where id = $1' using rid;
      end if;
      update public.purchase_requests set project_id = new_id where id = rid;
      moved := moved + 1;
    end if;
  end loop;

  if dry_run then
    raise notice 'DRY RUN -- nothing was changed. Set dry_run := false and run again to move these POs.';
  else
    raise notice 'Done: % PO(s) moved to %.', moved, new_entity;
  end if;
end;
$$;
