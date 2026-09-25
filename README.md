# Inventory — Parts Master List

React + Vite app backed by Supabase. Phase 1 of the inventory/PO/receipt
system: a browsable, searchable master list of spare parts, seeded from
`Basic List.xlsm`.

Per-project "required" / "shared" flags and PO/receipt tracking come in
later phases.

## One-time Supabase setup

1. Open the Supabase SQL editor for this project and run
   [`supabase/schema.sql`](supabase/schema.sql). This drops the old (empty)
   `parts` table and creates a new one with `gcs_id` as the primary key.
2. In the Supabase Table Editor, open the `parts` table and use
   **Insert > Import data from CSV**, pointing at
   [`supabase/parts_import.csv`](supabase/parts_import.csv) (377 rows,
   exported from the master spreadsheet).
3. Back in the SQL editor, run
   [`supabase/after_import.sql`](supabase/after_import.sql) once. This syncs
   the `gcs_id` auto-increment sequence past the imported rows (1-377) so
   new parts added through the app get the next free id.

## Run locally

```
npm install
npm run dev
```

Requires a `.env` file (see `.env.example`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_KEY`.

## Known data quirks (from the source spreadsheet)

- `gcs_part_id` has some duplicates/placeholder values ("REFURBISHED",
  "NEW" used as literal IDs for several unrelated parts) — not enforced
  unique.
- The original spreadsheet's per-site stock columns (Purchase, In-Transit,
  Stock Used, Stock On Hand, Re-order, Total On-Hand) were broken `#REF!`
  formulas pointing at a missing "Inventory Tracking" tab, so they were not
  imported. Only the master fields plus `common_spare_part` and
  `max_stock`/`min_stock` came across cleanly.
