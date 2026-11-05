-- READ-ONLY CHECK, changes nothing. Run it in the Supabase SQL editor IN THE INVENTORY PROJECT.
-- It lists which of the app's SQL files have (apparently) been run in this database, by looking for the tables,
-- columns and functions each one creates. Every row that says MISSING is a file still to run (see the run order in
-- CLAUDE.md, "SQL added in this round"). A row that says ok means the object is there, not that the file ran
-- cleanly end to end.
--
-- Not covered (there is nothing distinctive to look for): the security_0* files, add_prepaid_close_guard.sql and
-- add_invoice_hold_at_review.sql. Re-run those if you are not sure they were.

with checks (sql_file, what, found) as (
  values
  ('add_part_images',                'parts.image_url',                       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'parts' and column_name = 'image_url')),
  ('add_app_settings',               'table app_settings',                    to_regclass('public.app_settings') is not null),
  ('add_transfer_pos',               'function inv_private.create_transfer_po', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'inv_private' and p.proname = 'create_transfer_po')),
  ('add_po_invoice_email',           'purchase_requests.invoice_email',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'invoice_email')),
  ('add_ticket_link',                'purchase_requests.ticket_system_ticket_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'ticket_system_ticket_id')),
  ('add_ticket_code_link',           'purchase_requests.ticket_system_ticket_code', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'ticket_system_ticket_code')),
  ('add_parts_history',              'table parts_history',                   to_regclass('public.parts_history') is not null),
  ('add_vendor_approval',            'vendors.approval_status',               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vendors' and column_name = 'approval_status')),
  ('add_po_prepaid',                 'purchase_requests.prepaid',             exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'prepaid')),
  ('add_invoice_approval_flow',      'invoices.reviewed',                     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'reviewed')),
  ('add_payment_batches',            'table invoice_payment_batches',         to_regclass('public.invoice_payment_batches') is not null),
  ('add_po_history',                 'table po_history',                      to_regclass('public.po_history') is not null),
  ('add_vendor_deactivate',          'vendors.active',                        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vendors' and column_name = 'active')),
  ('add_invoice_duplicate_guard',    'function fn_find_duplicate_invoices',   exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fn_find_duplicate_invoices')),
  ('add_invoice_hold',               'invoices.held_at',                      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'held_at')),
  ('add_transfer_po_request_stage',  'function inv_private.create_transfer_po (can only confirm it exists)', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'inv_private' and p.proname = 'create_transfer_po')),
  ('add_office_location',            'projects.has_site_stock',               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'has_site_stock')),
  ('add_inventory_write_permission', 'function is_inventory_editor',          exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_inventory_editor')),
  ('add_part_datasheets',            'parts.datasheet_url',                   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'parts' and column_name = 'datasheet_url')),
  ('add_vendor_contacted',           'purchase_requests.vendor_contacted_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_requests' and column_name = 'vendor_contacted_at')),
  ('add_projects_layer',             'table programs',                        to_regclass('public.programs') is not null),
  ('add_invoice_over_po',            'invoices.exceeds_po',                   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'exceeds_po')),
  ('add_invoice_over_po',            'table purchase_request_links',          to_regclass('public.purchase_request_links') is not null),
  ('add_budget_amounts',             'table budget_amounts',                  to_regclass('public.budget_amounts') is not null),
  ('add_stock_location_choice',      'function fn_stock_location_choice_ready', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fn_stock_location_choice_ready')),
  ('add_suggestions',                'table suggestions',                     to_regclass('public.suggestions') is not null),
  ('add_user_signature',             'users.signature',                       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'signature'))
)
select case when found then 'ok' else 'MISSING' end as status, sql_file, what
from checks
order by found, sql_file, what;
