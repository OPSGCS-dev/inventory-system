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

- **Pre-paid parts POs:** `purchase_requests.prepaid` (`add_po_prepaid.sql`). A checkbox on a parts request (or, for an issued PO,
  a toggle in the Receipts & Invoices panel for accounting/admin) means there will be no receipts: `isPrepaid` /
  `canApproveInvoice` let an invoice go straight to Invoice Approval without a matched receipt, and `allInvoicesFullyResolved`
  needs only every invoice approved and paid. Marking a PO pre-paid also sets its parts status to the new `prepaid` value
  ("Pre-paid", which `isWorkFullyDone` counts as done), so it can close without the parts being marked Received -- those parts
  are then never added to stock unless someone sets Received first (`partsStatusForPrepaid`, `partsStatusOptions`). The SQL also
  widens the `parts_status` check constraint. Ignored on services-only POs. The save only sends `prepaid` when it changes, so
  requests still save before the SQL has been run.
- **Vendor approval guard:** a vendor that is still pending/rejected must not get a request approved or a PO issued. That
  rule used to live only in the browser, and failed open when the vendor row was missing. Now a trigger on
  `purchase_requests` enforces it (`add_vendor_approval_guard.sql`; needs `add_vendor_approval.sql`), and
  `vendorBlockFor` in App.jsx re-reads the vendor from the database and blocks when it can't be found. Note a vendor
  requested by someone holding `vendor_approval` is auto-approved on purpose.
- **Invoice scan and PO comparison:** choosing an invoice PDF in the PO's Receipts & Invoices panel (`InvoicesPanel`) now
  reads it (`src/scrape/`, same reader as the PO draft form) and opens `InvoiceReview`: invoice # and amount pre-filled
  (editable), a checklist against the PO (`scrape/comparePo.js`: vendor, PO number, total/cap, currency, subtotal/tax/
  shipping, line items paired by part number or wording), and the PO PDF (`buildPoPdf`) beside the invoice with the
  disagreeing figures boxed. **Warns only, never blocks.** Scanned PDFs have no text, so they are entered by hand. No SQL.
  pdf.js draws pages using the font files in `public/pdfjs/standard_fonts/` (copied from `node_modules/pdfjs-dist`;
  re-copy if pdfjs-dist is upgraded). A hidden browser tab pauses pdf.js page drawing (it waits on animation frames),
  so the pictures only appear once the tab is visible; the checklist and Add button don't wait for them.
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
(needs `ownership_location_01_schema.sql` first), `add_po_invoice_email`, `add_ticket_code_link`, `add_parts_history`, `add_vendor_approval_guard`, `add_po_prepaid`.

## What to build next

**The next big builds are on the payment / accounting side.** The user has said so but has not yet specified the
features, so ask what the first piece is before designing anything. Don't start the Accounting Audit tab yet; the user
has put it after this.

What exists today on that side, so new work extends it rather than duplicating it:

- **Invoices and receipts** are tables (`invoices`, `receipts`) hanging off a PO; an invoice is matched to a receipt
  (`InvoiceMatchChip`, `allInvoicesFullyResolved`), then approved (`invoice_approval` role), then marked paid
  (`payment` role). `payment_status` on the PO is a manual label; closing a PO (`canClosePo`) requires every
  receipt/invoice matched, approved and paid. Views: **My Invoices for Approval**, **My Invoices to Pay**
  (`MyInvoicesForApprovalTable`, `MyInvoicesToPayTable`, both with date sort/filter and totals).
- **Money on a PO:** line items, markup, shipping, credit, tax and currency (`computePoTotals`); Not to Exceed
  spending cap with `compareInvoicesToPo`; `chargeable_expense`; budget categories and sub-categories (a category is now
  required to save a draft); the invoice email address a PO tells vendors to use.
- **Reporting:** `PoLedgerTab` lists issued/closed POs with totals, ledger categories and CSV export.
- **Inter-entity charges:** stock transfers now create closed POs (sender as vendor, part Last Cost as price, payment left
  Unpaid). Nothing yet settles or reports on those.
- Open edges worth knowing: payment is recorded per invoice but there is no payment record (date, method, reference),
  no batch payment, no accounting export, and the transfer POs have no budget category.

Other unfinished items, lower priority: the Accounting Audit tab (`AuditTab`) still runs on made-up data held in browser
memory, and is next after payments; the ownership/location cutover after the recount (check whether it has already
happened before touching it; PO receiving through the screen has not been exercised end to end); the presenter guide and
handout (`Projects/ticket-system/.claude/scratch/gcs-*.html`) don't cover the new tabs; draft POs have no "View PO"
preview; POs created from a ticket show the old `TK-00042` label; Change History is visible only to inventory editors;
this README should be replaced.
