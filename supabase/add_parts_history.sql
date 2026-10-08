-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Change history for the Master List. Every time a part is added, edited or deleted, one row
-- is written to parts_history: who, when, and exactly which fields changed (old -> new).
--
-- It is done by a trigger on the parts table itself, so it catches every way a part can change:
-- Edit List, Import List, attaching or removing a picture, and anything done directly in the
-- database. Nobody can edit or erase the history from the app (it is read-only to signed-in
-- users; only the trigger writes to it). Changes that alter nothing (a save that rewrites the
-- same values) are not recorded. History starts from the moment this is run.
--
-- A change made from the SQL editor or a script (no signed-in user) is recorded with no user,
-- shown as "System".

create table if not exists public.parts_history (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by bigint references public.users (id) on delete set null,
  changed_by_name text,
  action text not null check (action in ('insert', 'update', 'delete')),
  part_gcs_id integer not null,   -- no foreign key: the part may be deleted later
  gcs_part_id text,               -- the part's Part ID at the time, for display
  -- insert: {field: {new}}   update: {field: {old, new}}   delete: {field: {old}}
  changes jsonb not null
);

create index if not exists parts_history_part_idx on public.parts_history (part_gcs_id, changed_at desc);
create index if not exists parts_history_changed_at_idx on public.parts_history (changed_at desc);

alter table public.parts_history enable row level security;

drop policy if exists "parts history read" on public.parts_history;
create policy "parts history read" on public.parts_history for select to authenticated using (true);
-- No insert / update / delete policies on purpose: only the trigger below writes.

create or replace function public.log_parts_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid bigint;
  uname text;
  o jsonb;
  n jsonb;
  k text;
  chg jsonb := '{}'::jsonb;
  pid integer;
  pname text;
begin
  select u.id, coalesce(nullif(u.display_name, ''), u.name) into uid, uname
  from public.users u where u.auth_user_id = auth.uid();

  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      continue when k in ('updated_at', 'created_at');
      if o -> k is distinct from n -> k then
        chg := chg || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
      end if;
    end loop;
    if chg = '{}'::jsonb then return null; end if;   -- nothing actually changed
    pid := new.gcs_id; pname := new.gcs_part_id;
  elsif tg_op = 'INSERT' then
    n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      continue when k in ('updated_at', 'created_at', 'gcs_id') or n -> k = 'null'::jsonb;
      chg := chg || jsonb_build_object(k, jsonb_build_object('new', n -> k));
    end loop;
    pid := new.gcs_id; pname := new.gcs_part_id;
  else
    o := to_jsonb(old);
    for k in select jsonb_object_keys(o) loop
      continue when k in ('updated_at', 'created_at', 'gcs_id') or o -> k = 'null'::jsonb;
      chg := chg || jsonb_build_object(k, jsonb_build_object('old', o -> k));
    end loop;
    pid := old.gcs_id; pname := old.gcs_part_id;
  end if;

  insert into public.parts_history (changed_by, changed_by_name, action, part_gcs_id, gcs_part_id, changes)
  values (uid, uname, lower(tg_op), pid, pname, chg);

  return null;
end;
$$;

revoke all on function public.log_parts_change() from public, anon, authenticated;

drop trigger if exists parts_history_trigger on public.parts;
create trigger parts_history_trigger
  after insert or update or delete on public.parts
  for each row execute function public.log_parts_change();
