-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
--
-- The Suggestions tab: anyone signed in can send in something they dislike, something broken or an idea
-- (what kind, which page of the site, and what they'd like), and it lands in a list for the admin.
--
--   * Anyone signed in can add a suggestion and read their OWN suggestions (and the admin's reply).
--   * Only an admin can see everyone's, change a suggestion's status (New / Looking at it / Planned / Done /
--     Won't do), write a reply, or delete one.
--   * Who sent it and when are filled in by the database, not the browser, so they can't be faked.

create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id bigint references public.users (id) on delete set null,
  user_name text,
  page text,
  kind text not null default 'idea' check (kind in ('broken', 'dislike', 'idea', 'other')),
  body text not null check (length(btrim(body)) between 3 and 4000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'declined')),
  admin_note text,
  updated_at timestamptz,
  updated_by bigint references public.users (id) on delete set null
);
create index if not exists suggestions_status_idx on public.suggestions (status, created_at desc);
create index if not exists suggestions_user_idx on public.suggestions (user_id);

-- The signed-in person's row in users (null for the service role / SQL editor).
create or replace function public.current_app_user_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from public.users u where u.auth_user_id = auth.uid() and u.active;
$$;
revoke all on function public.current_app_user_id() from public, anon;
grant execute on function public.current_app_user_id() to authenticated, service_role;

-- Who sent it / who changed it, and when: set here, whatever the browser sends.
create or replace function public.fn_suggestion_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid bigint := public.current_app_user_id();
  uname text;
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      select coalesce(nullif(u.display_name, ''), u.name) into uname from public.users u where u.id = uid;
      new.user_id := uid;
      new.user_name := uname;
    end if;
    new.created_at := now();
    -- A new suggestion always starts as New with no reply, whatever was sent.
    if uid is not null and not public.is_app_admin() then
      new.status := 'new';
      new.admin_note := null;
    end if;
  else
    new.updated_at := now();
    new.updated_by := uid;
    -- What was said, and by whom, can't be rewritten by an update.
    new.user_id := old.user_id;
    new.user_name := old.user_name;
    new.created_at := old.created_at;
    new.body := old.body;
    new.page := old.page;
    new.kind := old.kind;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_suggestion_stamp() from public, anon, authenticated;

drop trigger if exists trg_suggestion_stamp on public.suggestions;
create trigger trg_suggestion_stamp
  before insert or update on public.suggestions
  for each row execute function public.fn_suggestion_stamp();

alter table public.suggestions enable row level security;

drop policy if exists "suggestions read" on public.suggestions;
create policy "suggestions read" on public.suggestions for select to authenticated
  using (public.is_app_admin() or user_id = public.current_app_user_id());

drop policy if exists "suggestions add" on public.suggestions;
create policy "suggestions add" on public.suggestions for insert to authenticated
  with check (public.is_active_app_user());

drop policy if exists "suggestions admin update" on public.suggestions;
create policy "suggestions admin update" on public.suggestions for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "suggestions admin delete" on public.suggestions;
create policy "suggestions admin delete" on public.suggestions for delete to authenticated
  using (public.is_app_admin());

grant select, insert, update, delete on public.suggestions to authenticated, service_role;
