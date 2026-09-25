-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Adds a mailing/shipping address field to vendors, shown on the Users tab's
-- vendor form and (once wired up) on the printed/emailed Purchase Order.

alter table vendors add column if not exists address text;
