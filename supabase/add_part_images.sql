-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
-- IN THE INVENTORY PROJECT.
--
-- Reference image for each part on the Master List. The Master List shows a
-- small icon beside every part that has one; clicking it pops the image up.
--
--   parts.image_url        public URL of the image (null = none attached)
--   Storage bucket         'part-images' (public read, so the <img> just works)
--
-- Anyone can see the images; only an active user with the 'inventory' role
-- (the same people who can edit the Master List) can add, replace or remove
-- them. The app shrinks every picture to at most 900px before uploading.

alter table public.parts add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('part-images', 'part-images', true)
on conflict (id) do update set public = true;

drop policy if exists "part images read" on storage.objects;
create policy "part images read" on storage.objects
  for select using (bucket_id = 'part-images');

-- Same check for insert / update / delete: an active user holding 'inventory'.
drop policy if exists "part images insert" on storage.objects;
create policy "part images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'part-images'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );

drop policy if exists "part images update" on storage.objects;
create policy "part images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'part-images'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );

drop policy if exists "part images delete" on storage.objects;
create policy "part images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'part-images'
    and exists (select 1 from public.users u
                where u.auth_user_id = auth.uid() and u.active and 'inventory' = any (coalesce(u.roles, '{}')))
  );
