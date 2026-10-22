-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
-- Run it after add_po_prepaid.sql. Nothing else needs re-running.
--
-- A pre-paid PO used to be allowed to close with its parts still on "Pre-paid" instead of "Received".
-- For a PO with spare parts for the inventory that meant the parts never reached the stock count
-- (stock is only added when the parts are marked Received). The app now makes the requisitioner mark
-- such a PO Received before it can be closed; this is the database's own check of the same rule.
-- Pre-paid POs with no spare lines (services, consumables, parts used immediately) still close as before.

create or replace function public.fn_prepaid_close_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed'
     and coalesce(new.prepaid, false) and new.parts_status = 'prepaid'
     and exists (
       select 1 from public.purchase_request_lines l
       where l.purchase_request_id = new.id
         and l.line_type = 'part' and l.part_gcs_id is not null
         and coalesce(l.inventory_action, '') not in ('used_immediately', 'consumable', 'transfer')
     ) then
    raise exception 'This pre-paid PO has spare parts that haven''t been received yet. Set its Parts status to Received (that adds them to the stock count) before closing it.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepaid_close_guard on public.purchase_requests;
create trigger trg_prepaid_close_guard
  before update on public.purchase_requests
  for each row execute function public.fn_prepaid_close_guard();
