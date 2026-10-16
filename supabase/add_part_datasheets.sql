-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT. Safe to repeat.
--
-- A datasheet for each part on the Master List, set up like the reference picture
-- (add_part_images.sql):
--
--   parts.datasheet_url   where the datasheet is: the public URL of an uploaded file, or a link to one
--                         anywhere else (null = none attached)
--   Storage bucket        'part-datasheets' (public read, so the link just opens), up to 25 MB a file
--
-- The Master List shows a small document icon beside every part that has one; clicking it opens the
-- datasheet in a new tab. Anyone signed in can open them; only an active user with the 'inventory' role
-- can attach, replace or remove them (in Edit List: Upload a PDF, or Link to paste an address).

alter table public.parts add column if not exists datasheet_url text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('part-datasheets', 'part-datasheets', true, 26214400)
on conflict (id) do update set public = true, file_size_limit = 26214400;

drop policy if exists "part datasheets read" on storage.objects;
create policy "part datasheets read" on storage.objects
  for select using (bucket_id = 'part-datasheets');

-- Same check for insert / update / delete: an active user holding 'inventory'.
drop policy if exists "part datasheets insert" on storage.objects;
create policy "part datasheets insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'part-datasheets'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );

drop policy if exists "part datasheets update" on storage.objects;
create policy "part datasheets update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'part-datasheets'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );

drop policy if exists "part datasheets delete" on storage.objects;
create policy "part datasheets delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'part-datasheets'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );
