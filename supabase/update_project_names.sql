-- Run this once in the Supabase SQL editor.
-- Corrects the 3 existing project names to match the confirmed full list,
-- and adds the remaining projects. No project_parts rows exist yet for
-- these projects, so renaming in place is safe.

update projects set name = 'SunE Norfolk LP' where name = 'SunEd Norfolk LP';
update projects set name = 'SunE Hwy 2S LP' where name = 'SunE Hwy 2S';
update projects set name = 'SunE Odessa LP' where name = 'SunE Odessa';

insert into projects (name) values
  ('SunE Unity LP'),
  ('SunE Sandhurst LP'),
  ('SunE Ray LP'),
  ('SunE South Stormont LP'),
  ('SunE Rutley LP')
on conflict (name) do nothing;
