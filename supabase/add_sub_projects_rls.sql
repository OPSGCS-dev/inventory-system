-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- The new "sub_projects" table came up with Row Level Security enabled and
-- no policies, blocking the app's anon key entirely (confirmed via a live
-- 401 "new row violates row-level security policy" error). Every other
-- table in this app (purchase_requests, users, vendors, projects, etc.) is
-- readable/writable by anon with no RLS restriction, so this brings
-- sub_projects in line with that same fully-open model.

alter table sub_projects disable row level security;
