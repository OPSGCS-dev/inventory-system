-- ONE-OFF FIX, NOT A MIGRATION. Run it in the Supabase SQL editor IN THE INVENTORY PROJECT when a request was
-- submitted under the wrong person's name and you want to correct who the Requester (requisitioner) is.
--
-- Why it happens: "Requested by" used to be stamped with whoever pressed Submit, and anyone who could create requests
-- could press Submit on anyone's draft. (Now the draft's creator is recorded when it is first saved, and only they can
-- submit it -- see add_draft_submit_guard.sql.)
--
-- Change the two values at the top (the request's ID and the person's name), run it, check the NOTICE, then reload the
-- list. It only changes who the request is "from": who it is waiting on to close it, who reviews its invoices, and the
-- Requisitioner on the printed PO. It does not touch approvals that already happened. The PO History records the change
-- as "Requested by" old -> new (shown without a person's name, since it was made from the SQL editor, not by a signed-in
-- user).
--
-- Works on a request in any status. Find it by its ID (the "ID" column in the PO list), since a request that hasn't been
-- issued yet (it still shows "Convert to PO") has no PO number.

do $$
declare
  request_id_to_fix bigint := 0;                    -- <<< the request's ID, from the ID column of the PO list
  new_requester     text   := 'PUT-THEIR-NAME-HERE'; -- <<< the person's name exactly as in Admin > Users (not case sensitive)

  pr record; u record; n int;
begin
  select count(*) into n from public.purchase_requests where id = request_id_to_fix;
  if n = 0 then raise exception 'No request with ID % -- check the ID column in the PO list.', request_id_to_fix; end if;

  select count(*) into n from public.users
   where lower(coalesce(nullif(trim(display_name), ''), name)) = lower(trim(new_requester)) or lower(name) = lower(trim(new_requester));
  if n = 0 then raise exception 'No user named "%" -- use the name as shown in Admin > Users.', new_requester; end if;
  if n > 1 then raise exception '% users match "%" -- stopping.', n, new_requester; end if;

  select * into u from public.users
   where lower(coalesce(nullif(trim(display_name), ''), name)) = lower(trim(new_requester)) or lower(name) = lower(trim(new_requester));
  select * into pr from public.purchase_requests where id = request_id_to_fix;

  update public.purchase_requests set requested_by = u.id where id = pr.id;
  raise notice 'Request % (PO number: %): requester changed from user id % to % (user id %).',
    pr.id, coalesce(pr.po_number, 'not issued yet'), pr.requested_by, coalesce(nullif(trim(u.display_name), ''), u.name), u.id;
end;
$$;
