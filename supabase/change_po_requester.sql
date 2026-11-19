-- ONE-OFF FIX, NOT A MIGRATION. Run it in the Supabase SQL editor IN THE INVENTORY PROJECT when a request was
-- submitted under the wrong person's name and you want to correct who the Requester (requisitioner) is.
--
-- Why it happens: a draft has no owner. "Requested by" is stamped with whoever presses Submit, and anyone who can
-- create requests can press Submit on anyone's draft. If someone else (or a browser still signed in as someone else)
-- submitted it, it shows under that person.
--
-- Change the two values at the top, run it, check the NOTICE, then reload the PO list. It only changes who the PO
-- is "from": who it is waiting on to close it, who reviews its invoices, and the Requisitioner on the printed PO.
-- It does not touch approvals that already happened. The PO History records the change as "Requested by" old -> new
-- (shown without a person's name, since it was made from the SQL editor, not by a signed-in user).
--
-- Works on a PO in any status except that the new person should be able to create requests for its entity.

do $$
declare
  po_number_to_fix text := 'PUT-THE-PO-NUMBER-HERE';   -- <<< the PO number as shown in the list (e.g. the entity code and number)
  new_requester    text := 'PUT-THEIR-NAME-HERE';      -- <<< the person's name exactly as in Admin > Users (not case sensitive)

  pr record; u record; n int;
begin
  select count(*) into n from public.purchase_requests where po_number = po_number_to_fix;
  if n = 0 then raise exception 'No PO with number "%" -- check the number (a draft has none; use its id instead).', po_number_to_fix; end if;
  if n > 1 then raise exception '% POs share the number "%" -- stopping.', n, po_number_to_fix; end if;

  select count(*) into n from public.users
   where lower(coalesce(nullif(trim(display_name), ''), name)) = lower(trim(new_requester)) or lower(name) = lower(trim(new_requester));
  if n = 0 then raise exception 'No user named "%" -- use the name as shown in Admin > Users.', new_requester; end if;
  if n > 1 then raise exception '% users match "%" -- stopping.', n, new_requester; end if;

  select * into u from public.users
   where lower(coalesce(nullif(trim(display_name), ''), name)) = lower(trim(new_requester)) or lower(name) = lower(trim(new_requester));
  select * into pr from public.purchase_requests where po_number = po_number_to_fix;

  update public.purchase_requests set requested_by = u.id where id = pr.id;
  raise notice 'PO % (id %): requester changed from user id % to % (user id %).',
    po_number_to_fix, pr.id, pr.requested_by, coalesce(nullif(trim(u.display_name), ''), u.name), u.id;
end;
$$;
