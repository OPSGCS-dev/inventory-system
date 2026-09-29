-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- A `users` row is currently created the instant an invite/reset link is
-- generated -- before the person has clicked anything, let alone actually
-- set a password. That makes a pending invite indistinguishable from a
-- real, working account in the Users tab. activated_at (null until they
-- successfully set their password) fixes that.
--
-- Backfill: every row that already existed before this migration is
-- treated as already activated (real accounts long predate this concept).
-- The one known exception is a row created via a still-pending invite link
-- sent right before this migration landed -- that row will show as
-- "activated" until that person actually completes setup, at which point
-- handlePasswordSetup overwrites activated_at with the real timestamp
-- anyway, so it's self-correcting.

alter table users add column activated_at timestamptz;
update users set activated_at = created_at where activated_at is null;
