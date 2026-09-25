-- Run this once in the Supabase SQL editor to add the new "Where Used"
-- column to the existing parts table. Additive only — no data is affected.

alter table parts add column if not exists where_used text;
