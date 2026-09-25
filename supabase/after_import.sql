-- Run this once, AFTER importing parts_import.csv via the Supabase Table
-- Editor. The CSV import inserts explicit gcs_id values (1-377), which
-- doesn't advance the identity sequence behind that column — without this,
-- the next part added through the app would try to reuse gcs_id 1 and fail.

select setval(pg_get_serial_sequence('parts', 'gcs_id'), (select max(gcs_id) from parts));
