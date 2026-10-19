-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to run again.
--
-- Puts back Manufacturer, Mfr Part # and Category on parts where an Import List that had no such columns
-- blanked them (the descriptions-only import ran on the old Import List code, which cleared the columns the
-- file didn't have). The exact old values are still in the Master List change history (parts_history), so
-- this reads them from there.
--
-- It only FILLS IN a field that is empty right now, using the value the most recent import-type change blanked,
-- looking back as far as `since` below. A field that has a value is never touched, so anything edited after
-- the import is kept. Descriptions, Last Cost, pictures and datasheets are not touched at all.
--
-- Change `since` if the import was longer ago than two days.

do $$
declare
  since timestamptz := now() - interval '2 days';
  restored integer;
begin
  with blanked as (
    select distinct on (h.part_gcs_id, f.field)
           h.part_gcs_id, f.field, h.changes -> f.field ->> 'old' as old_value
    from public.parts_history h
    cross join (values ('manufacturer'), ('manufacturer_part_number'), ('spare_category')) as f(field)
    where h.action = 'update'
      and h.changed_at >= since
      and jsonb_typeof(h.changes -> f.field -> 'old') = 'string'   -- it had a value...
      and jsonb_typeof(h.changes -> f.field -> 'new') = 'null'     -- ...and was blanked
    order by h.part_gcs_id, f.field, h.changed_at desc
  )
  update public.parts p
  set manufacturer = coalesce(p.manufacturer, (select b.old_value from blanked b where b.part_gcs_id = p.gcs_id and b.field = 'manufacturer')),
      manufacturer_part_number = coalesce(p.manufacturer_part_number, (select b.old_value from blanked b where b.part_gcs_id = p.gcs_id and b.field = 'manufacturer_part_number')),
      spare_category = coalesce(p.spare_category, (select b.old_value from blanked b where b.part_gcs_id = p.gcs_id and b.field = 'spare_category')),
      updated_at = now()
  where exists (select 1 from blanked b where b.part_gcs_id = p.gcs_id)
    and (p.manufacturer is null or p.manufacturer_part_number is null or p.spare_category is null);
  get diagnostics restored = row_count;
  raise notice 'Restored blanked fields on % part(s).', restored;
end $$;

-- To check the result afterwards: parts that still have no manufacturer / Mfr Part # / category.
-- select gcs_id, gcs_part_id, manufacturer, manufacturer_part_number, spare_category
-- from public.parts where manufacturer is null or manufacturer_part_number is null or spare_category is null
-- order by gcs_id;
