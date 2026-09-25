-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Tracks when each part row was last changed, so the Master List can show
-- "Last updated: <date>" (the most recent value across all parts).

alter table parts add column updated_at timestamptz;
