# Inventory system (Great Circle Solar)

Spare-parts inventory, purchasing and accounting for GCS's solar entities. A single-page React app on
Supabase. A separate app, the **ticket system** (Next.js, its own Supabase project, `Projects/ticket-system`),
reads and links to this one's purchase orders. The README in this repo is from phase 1 and is out of date;
trust this file and the code.

## Tech stack

- **Frontend:** React 19 + Vite 8, plain JSX (no TypeScript). Lint with `npx oxlint src` (hooks rules are errors;
  the `set-state-in-effect` / `exhaustive-deps` warnings are long-standing, don't chase them).
- **Backend:** Supabase (Postgres + RLS + auth + Storage), called straight from the browser with
  `@supabase/supabase-js` (`src/supabaseClient.js`). Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.
  Storage buckets: `quotes`, `invoices`, `receipts`, `part-images`.
- **Libraries:** `papaparse` (CSV), `xlsx` (Excel import/export), `jspdf` + `jspdf-autotable` (PO PDF, `src/poPdf.js`),
  `pdfjs-dist` (reads vendor quote PDFs, `src/scrape/`).
- **Hosting:** Vercel. One serverless function, `api/invite-user.js` (creates users). The ticket system's URL is
  `TICKETING_URL` in `src/utils.js`.
- **Commands:** `npm run dev`, `npx vite build` (the check that matters), `npx oxlint src`. There is no test suite.

## Component structure

- `src/App.jsx` (~4,400 lines) is the hub: it owns almost all state, data loading and action handlers
  (`handleSaveEdits`, `handleSetTicketLink`, PO create/approve/issue, user admin, ...) and passes them down as props.
  New behaviour usually means a handler here plus a prop into a tab.
- `src/tabs/` holds one component per screen. Top-level tabs: **Master List** (`MasterListTab`), **Required Inventory**
  (`RequiredInventoryTab`, tab id `projects`), **Inventory On Hand** (sub-tabs `OwnershipTab`, `PhysicalLocationTab`,
  `HistoryPanel`), **Purchase Orders** (`PurchaseOrdersTab`, ~2,400 lines, with the `My ...` approval/issue/pay views),
  **Audit** (`AuditTab`, preview), **PO Ledger** (`PoLedgerTab`), **Admin** (`UsersTab`, tab id `users`).
- Shared pieces: `DateRange.jsx` (`useDateRange` hook + `DateRangeFilter` + `DateSortHeader`, used by the PO list, both
  invoice tabs and the parts history), `PartsHistoryPanel.jsx`, `TicketLinkEditor` (inside `PurchaseOrdersTab`).
- `src/utils.js`: role helpers (`canEditInventory`, `isAdmin`, ...), PO maths (`computePoTotals`), status/label maps,
  `formatMoney`, ticket-link helpers, `poInstructions`, `poEmailSubject`. `src/stockUtils.js`: location keys, CSV download,
  paged reads. `src/imageUtils.js`: part-picture shrinking. `src/poPdf.js` / `src/poEmail.js`: PO PDF and `.eml` draft.
- Roles live on `users.roles` (`admin`, `inventory`, `purchase_req`, `po_issue`, `invoice_approval`, `payment`, ...);
  some are limited per entity (`user_role_entities`). "Entity" = a `projects` row (a solar site company).

## Styling

One hand-written stylesheet, `src/App.css` (~900 lines); no Tailwind, no CSS-in-JS. Colours are CSS variables on `:root`
(`--bg`, `--card`, `--ink`, `--muted`, `--accent`, `--border`, `--danger`, `--warn`, `--success`), a warm off-white
palette with blue accents. Reuse the existing classes before adding new ones: `card` / `card-header`, `edit-toolbar`,
`btn-primary` / `btn-secondary`, `sheet-wrap` + `table.sheet` (spreadsheet-style tables), `status ok|err`, `po-badge-*`,
`nav-badge`, `field-row`, `field-invalid`, and the `po-print-*` set for the printable PO. Small one-offs use inline
`style`. Keep new CSS appended near related rules with a short comment.

## How database changes work

- Schema changes are plain SQL files in `supabase/` that **the user runs by hand** in the Inventory project's Supabase
  SQL editor. Make them idempotent (`if not exists`, `create or replace`), say what to run and in what order, and make
  the app degrade gracefully (clear message, or fall back) if a file hasn't been run yet.
- Stock is only changed through `security definer` functions (`fn_stock_transfer`, `fn_move_location`, `fn_record_use`,
  `fn_apply_count`, `fn_receive_po_parts`) that enforce the ownership/location rules and write History. Don't write
  `stock_on_hand` / `stock_location` from the client.
- Auditing is done in the database: the `parts` trigger writes `parts_history`; stock changes write the inventory journal.
- Admin-editable settings live in `app_settings` (today: the consumable per-unit cap, enforced by a trigger).
- There is no migration tool and not every file is known to have run in production. Before relying on a new column or
  function, check with the user. `scripts/build_test_database.mjs` builds a full test database; `build/test_copy/` is its output.

## Working here

- **Verify before saying done:** run `npx vite build`; for database logic, replay `build/test_copy/1_schema.sql` +
  `2_seed.sql` + the new SQL in PGlite (in-memory Postgres; a working harness is in
  `Projects/ticket-system/.claude/scratch/harness`, which can also render the real tabs with a fake Supabase client).
- Some files use CRLF line endings (`OwnershipTab`, `PhysicalLocationTab`, `utils.js`, ...). Edit in a way that
  preserves each file's endings; the git "LF will be replaced by CRLF" warnings are normal.
- The user has said to commit and push to `main` once a change is verified, without asking. End commit messages with the
  `Co-Authored-By` line the harness gives you.
- Don't hardcode what an admin might change, and don't put credentials in files or chat.

## Recent work (refinement of the inventory system)

Most recent first, all on `main`:

- **Master List change history:** trigger on `parts` -> `parts_history`; "Change History" panel with filters. (`add_parts_history.sql`)
- **Tickets <-> POs:** link an existing PO to a ticket by number from either app (`TicketLinkEditor`; ticket side has
  "Link existing PO" and `/tickets/find`). (`add_ticket_code_link.sql`)
- **PO polish:** budget category required to save a draft and shown on the PO header; `DRAFT` watermark until approved;
  invoice-email dropdown (`add_po_invoice_email.sql`); address blurb removed from the PO footer; vendor email subject
  carries the entity and is only offered once the PO is issued.
- **Lists:** Date column plus sort and From/To filters on the PO list and both invoice tabs; amounts and pending totals on
  the approval tabs; Physical Location export follows its location dropdown.
- **Transfers and parts:** every Stock Transfer also writes a closed PO from the sending to the receiving entity
  (`add_transfer_pos.sql`); reference picture per part (`add_part_images.sql`); admin-editable consumable cap
  (`add_app_settings.sql`, Admin > Settings).
- **Earlier:** Ownership vs Physical Location split with function-based stock changes and an opening import; Accounting
  Audit tab (demo); security hardening (`security_0*.sql`).

SQL added in this round (run in this order if not already run): `add_part_images`, `add_app_settings`, `add_transfer_pos`
(needs `ownership_location_01_schema.sql` first), `add_po_invoice_email`, `add_ticket_code_link`, `add_parts_history`.

## What to build next

Nothing is written down as "next" in the repo, so this is my reading of what is unfinished. Confirm with the user:

1. **Make the Accounting Audit tab real.** `AuditTab` opens with made-up books data and keeps resolutions and the
   sign-off in browser memory only. It needs tables for uploaded books data, per-part resolutions with reasons, and
   sign-off, plus entries in History. This is the likeliest next feature.
2. **Finish the ownership/location cutover.** After the recount: regenerate the opening import, back up, run schema +
   import, deploy, then `ownership_location_03_lock_stock_writes.sql`. PO receiving through the Purchase Orders screen
   has not been exercised end to end. Check whether this has already happened before touching it.
3. **Docs:** the presenter guide and handout (`Projects/ticket-system/.claude/scratch/gcs-*.html`) don't cover the new tabs.
4. **Small follow-ups seen along the way:** draft POs have no "View PO" preview (so no watermark to see); transfer POs
   have no budget category; POs created from a ticket show the old `TK-00042` label; Change History is visible only to
   inventory editors; this README should be replaced.
