-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Two problems this fixes:
-- 1. The new "quotes" Storage bucket has no RLS policies at all yet --
--    toggling a bucket Public in the dashboard only affects anonymous
--    reads/downloads, never writes -- so uploading a quote fails with
--    "new row violates row-level security policy" until this runs.
-- 2. The existing "invoices" and "receipts" buckets were only ever given
--    read + insert policies, never delete -- so every "Delete" button in
--    the app silently left the underlying PDF behind in Storage even
--    though the row was gone from the table. The app now also calls
--    storage.remove() whenever an invoice, receipt, quote, or whole
--    purchase request is deleted, but that call needs a delete policy to
--    actually succeed.

drop policy if exists "Allow public read on quotes" on storage.objects;
create policy "Allow public read on quotes" on storage.objects
  for select using (bucket_id = 'quotes');

drop policy if exists "Allow public insert on quotes" on storage.objects;
create policy "Allow public insert on quotes" on storage.objects
  for insert with check (bucket_id = 'quotes');

drop policy if exists "Allow public update on quotes" on storage.objects;
create policy "Allow public update on quotes" on storage.objects
  for update using (bucket_id = 'quotes');

drop policy if exists "Allow public delete on quotes" on storage.objects;
create policy "Allow public delete on quotes" on storage.objects
  for delete using (bucket_id = 'quotes');

drop policy if exists "Allow public delete on invoices" on storage.objects;
create policy "Allow public delete on invoices" on storage.objects
  for delete using (bucket_id = 'invoices');

drop policy if exists "Allow public delete on receipts" on storage.objects;
create policy "Allow public delete on receipts" on storage.objects
  for delete using (bucket_id = 'receipts');
