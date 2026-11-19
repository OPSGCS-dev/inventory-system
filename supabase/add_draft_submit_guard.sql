-- Only the person who created a draft can submit it for approval, so a request can't end up under someone else's name.
-- Run any time; safe to re-run. The app already hides the Submit button from everyone else (and says who can submit);
-- this makes the database refuse it too.
--
-- The app now records the creator in purchase_requests.requested_by when a draft is first saved (it used to be stamped
-- only at Submit, by whoever pressed it). A draft from before that has no requested_by: anyone who can create requests may
-- submit it and becomes its requester. Requests sent back for revision keep their requester, so it is theirs to resubmit.
--
-- Does not apply to work done from the SQL editor (no signed-in user), e.g. change_po_requester.sql.
create or replace function public.fn_draft_submit_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
begin
  if old.status = 'draft' and new.status = 'submitted' and auth.uid() is not null then
    select u.id into me from public.users u where u.auth_user_id = auth.uid() and u.active;
    if me is null or new.requested_by is distinct from me or (old.requested_by is not null and old.requested_by <> me) then
      raise exception 'Only the person who created a draft can submit it.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_draft_submit_guard() from public, anon, authenticated;

drop trigger if exists trg_draft_submit_guard on public.purchase_requests;
create trigger trg_draft_submit_guard
  before update on public.purchase_requests
  for each row execute function public.fn_draft_submit_guard();
