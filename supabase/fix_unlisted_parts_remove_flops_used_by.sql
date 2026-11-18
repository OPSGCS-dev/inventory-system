-- One-off clean-up. Run ONCE in the Supabase SQL editor.
--
-- An earlier version of add_unlisted_parts_used_by.sql also made Firelight Operations LP (FLOPS) a user of the 48
-- unlisted parts (numbered 380 and up). Firelight Operations is meant to OWN them, not use them, so this removes
-- those Used By entries.
--
-- Safe by design:
--   * only touches Firelight Operations LP (or FLOPS) and only parts numbered above 379;
--   * leaves an entry alone if Firelight Operations already has units of that part recorded (it lists those at the
--     end as "KEPT - has stock"), so no counted stock is ever hidden;
--   * does not touch parts, stock, locations or any other entity's Used By.
-- It is ONE statement and prints one row per entry it removed or kept. Running it again removes nothing more.

with ent as (
  select id from public.projects where name in ('Firelight Operations LP', 'FLOPS')
),
removed as (
  delete from public.project_parts pp
  using ent
  where pp.project_id = ent.id
    and pp.part_gcs_id > 379
    and not exists (
      select 1 from public.stock_on_hand s
      where s.project_id = pp.project_id and s.part_gcs_id = pp.part_gcs_id and s.quantity > 0
    )
  returning pp.part_gcs_id
)
select r.part_gcs_id as "GCS P/N", 'removed' as "Result"
from removed r
union all
select pp.part_gcs_id, 'KEPT - has stock'
from public.project_parts pp
join ent on ent.id = pp.project_id
where pp.part_gcs_id > 379
  and pp.part_gcs_id not in (select part_gcs_id from removed)
order by 1;
