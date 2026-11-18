-- Run this once in the Supabase SQL editor IN THE INVENTORY PROJECT (any time after add_vendor_address.sql). Safe to repeat.
--
-- Fuller vendor records, matching the GCS vendor contact list:
--   vendor_code     the vendor's number from the old FileMaker list (1050, 1051 ...). Unique when filled in.
--   legal_name      the name as it should read on the PO and in the records ("15493757 Canada Inc. (o/a ...)").
--                   `name` stays the short name people pick from the list.
--   address         now holds Address Line 1 only (older vendors may still have a whole multi-line address in it,
--                   which still prints as before)
--   address_line2, city, region (province / state), postal_code, country
--   mobile, alt_email (one or more extra addresses, separated by ;), website
--
-- Until this is run the app keeps working: the vendor form saves the old fields only (the address is stored as
-- one block of text in `address`) and says so.

alter table public.vendors add column if not exists vendor_code text;
alter table public.vendors add column if not exists legal_name text;
alter table public.vendors add column if not exists address_line2 text;
alter table public.vendors add column if not exists city text;
alter table public.vendors add column if not exists region text;
alter table public.vendors add column if not exists postal_code text;
alter table public.vendors add column if not exists country text;
alter table public.vendors add column if not exists mobile text;
alter table public.vendors add column if not exists alt_email text;
alter table public.vendors add column if not exists website text;

-- A vendor number is only ever used once (blank numbers don't count).
create unique index if not exists vendors_vendor_code_key
  on public.vendors (vendor_code) where vendor_code is not null;
