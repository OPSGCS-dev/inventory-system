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

- **Part descriptions are three lines:** (1) what it is -- a generic term (Relay, Contactor, Circuit Breaker, Fuse ...), (2) model and ratings, (3) anything else
  (optional), kept in the one `parts.description` field with line breaks. The Master List shows them on separate lines (`.desc-lines`, `white-space: pre-line`) and
  edits them in a 3-row textarea; one-line places use `descriptionOneLine`. Import List/Export List carry the line breaks in a quoted CSV cell. The existing 378
  descriptions were redrafted into this form in a review workbook (`build/description_review/master-list-descriptions-review.xlsx`, not committed), awaiting
  answers on the flagged parts before anything is imported -- when importing, remember Import List overwrites Mfr Part #, Manufacturer and Category with whatever
  the file has, so build the file from a fresh Export List.
- **Audit prices, Part ID, PO list columns:** the Audit page (`AuditTab`) is now two views: **Inventory Counts** (`AuditCountsPanel`, the old screen) and **Prices**
  (`AuditPricesPanel`): accounting uploads a part-number + unit-cost file and it is compared with every part's Last Cost (`parts.last_cost`), with the same
  needs-review / adjust-and-confirm / sign-off flow, a "value of the differences" tile (difference x units on hand) and CSV export. A plain-number part number
  is the GCS P/N; text is looked up as the Part ID or Mfr Part #. **Still a preview, like the counts view: it opens on made-up prices and nothing is saved**
  (it doesn't change Last Cost). The **Part ID column is gone from the Master List** (table, filter, edit rows, export, import preview); the database column
  `parts.gcs_part_id` is still there (NOT NULL, used by search, PO line labels, ...), so a new part gets `derivePartLabel(mfr part #, description)` and an import
  only changes a Part ID if the file supplies one. Global search now jumps to a part by GCS P/N. The PO list no longer has the **Work and Payment columns**
  (still on the PO's own page).
- **Inventory locations, permissions and datasheets:** (1) **Locations** are Oshawa, Barn and Office, plus an entity's own site. `'storage'` is still the stored
  name but is **labelled Oshawa** everywhere (`locLabel`); `'office'` is new. `add_office_location.sql` (after `add_transfer_po_request_stage.sql`) widens the
  `stock_location` check and replaces `fn_stock_transfer`, `fn_move_location`, `fn_record_use`, `fn_apply_count`, `fn_receive_po_parts` and `assert_part_ok`.
  (2) **Entities with no site:** `projects.has_site_stock` (false for FLOPS and Firelight, set once by that file; no admin screen for it yet). They still own
  parts but have no site column on Physical Location, the database refuses anything placed on their site (rule R3 in `assert_part_ok`), and units for them (PO
  receiving, count increases, a transfer defaulting to "own site") go to Oshawa; the SQL moved any units already on such a site to Oshawa with a History
  entry. `hasSiteStock(project)` in stockUtils. (3) **Permissions:** every signed-in user can see Master List, Required Inventory, Ownership, Physical
  Location, History and Change History; only the `inventory` role changes anything (`canEditInventory`; handlers also check it). The stock functions already
  required the role in the database; `add_inventory_write_permission.sql` adds `is_inventory_editor()` and makes writes to `parts` and `project_parts` need
  it too. (4) **Datasheets:** `parts.datasheet_url` + public bucket `part-datasheets` (`add_part_datasheets.sql`); in Edit List each part has PDF (upload) /
  Link (paste an address) / remove; the Master List shows a document icon that opens it (`handlePartDatasheet`). (5) PO list status filter has **Open (not
  closed)**.
- **PO list round (status words, filters, voids, transfers):** (1) **Transfer POs start at the request stage** -- `add_transfer_po_request_stage.sql`
  (run after `add_transfer_pos.sql`) replaces `inv_private.create_transfer_po` so a Stock Transfer's PO is created *Requested* (the person who did the
  transfer is the requester) instead of Closed, and has to be approved/issued/received/closed by hand; the stock still moves with the transfer, and
  `inventory_action = 'transfer'` lines are never added to stock again on receiving. Older transfer POs stay closed. (2) **Voiding a PO no longer requires
  removing its invoices/receipts** (`voidBlockReason`: only parts-already-received, a paid invoice or an invoice approved for payment block it); a voided
  PO shows a read-only "Receipts & Invoices" list (`VoidedAttachments`) so the files stay openable, and its invoices drop out of the My Invoices lists.
  (3) The printed/PDF PO shows the **Requisitioner** (`requisitionerName`, `requisitioner_name` on the request passed to `buildPoPdf`). (4) **Excel-style
  column filters** (`tabs/ColumnFilter.jsx`: `useColumnFilters`, `FilterTh`, `ColumnFilterBar`) on the PO list and the three My Invoices lists: a ▾ on
  each heading opens a tick-list with search; columns narrow each other's lists; filters reset when the view changes. (5) The Status column shows just the
  word (`poStatusText`, `PoStatusBadge`); the dots and the legend above the table are gone.
- **Invoice holds:** a supervisor (Payment Approval role) can put an invoice **on hold**, with a reason, while it waits for payment approval or
  after approval but before it is paid (`invoices.held_by/_at`, `hold_reason`; `add_invoice_hold.sql`, run after `add_invoice_approval_flow.sql`, then
  re-run `add_po_history.sql` for the "put on hold" / "released" events). A hold is a pause, not a stage: `invoiceStage` is unchanged, the invoice stays
  in the supervisor's and accounting's lists (flagged "On hold", with the reason) but can't be ticked into a batch, approved or confirmed paid until
  released (`canHoldInvoice` / `canReleaseInvoice` / `isInvoiceHeld` in utils.js; `handleHoldInvoice` / `handleReleaseInvoice`; the trigger
  `fn_invoice_hold_guard` enforces it). Sending back clears the hold; an admin can release too. Held invoices don't count in the nav badges. Until the SQL
  is run `invoiceHoldReady` is false and the Hold buttons don't appear.
- **Duplicate invoice guard:** the same vendor can't have the same invoice number twice (case/space/punctuation ignored, any PO, voided POs
  excluded) unless the person adding it gives a reason (`invoices.duplicate_reason`, >= 5 chars, shown in PO History). Enforced by a trigger on
  `invoices` (`fn_invoice_duplicate_guard`; only on insert or when the number/PO changes, so existing invoices still approve and pay). Same vendor +
  same amount in the last 90 days is only a warning. `fn_find_duplicate_invoices` is what the app asks (`src/invoiceDuplicates.js`, shown in
  `InvoiceReview`); until `add_invoice_duplicate_guard.sql` is run the app falls back to its old same-PO warning. Run after `add_po_history.sql`.
- **Vendors are deactivated, not deleted:** `vendors.active` (+ `deactivated_by/_at`, `deactivation_reason`; `add_vendor_deactivate.sql`, run after
  `add_vendor_approval_guard.sql`). Admin > Vendors has Deactivate / Reactivate (`handleSetVendorActive`, which also switches off the vendor's
  logon). A deactivated vendor drops out of the PO form's vendor list, can't be used to approve a request or issue a PO (`vendorBlockReason` /
  `isVendorActive`, and the same trigger as the approval guard, now extended), but its existing POs carry on. Audited as vendor_deactivated /
  vendor_reactivated (re-run `add_po_history.sql` to pick those up). **Delete is kept TEMPORARILY while testing** (button in UsersTab,
  `handleDeleteVendor`, both marked) -- when testing is over, remove it, like PO delete was restored to drafts only.
- **PO History (audit trail):** `po_history` (`add_po_history.sql`; run after the other PO SQL files, and re-run it if one of them
  is run later) is written only by database triggers (`fn_po_audit` on `purchase_requests`, lines, `invoices`, `receipts`,
  `invoice_payment_batches`, `vendors`): who (real signed-in user), when (server time), event code, and field-by-field old -> new,
  with PO number / entity / vendor / person's name snapshotted. No foreign keys, so it survives deleting a PO. Append-only (insert/
  update/delete/truncate revoked and refused) and hash-chained (`seq`, `prev_hash`, `row_hash`); `fn_verify_po_history()` is the
  "Verify integrity" button. Readable only by admin, Invoice Matching, Payment Approval, Payment, Purchase Rec Approval and PO Issue
  (`can_view_po_history()`, mirrored by `canViewPoHistory`). Document events the database can't see (PO PDF downloaded, vendor email
  drafted) go through the `fn_log_po_event` RPC (`logPoDocumentEvent` in App.jsx). The old per-PO activity feed
  (`purchase_request_activity`, written by `logPoActivity` from the browser) is unchanged and is *not* tamper-proof (anyone signed in
  can insert into it, and it vanishes with its PO); its existing rows were copied into po_history once. The `PoHistoryTab` filters
  server-side (date, person, entity, vendor, category, event, free text, one PO) and exports CSV including the hashes;
  `src/poHistory.js` holds the labels and the text for each event. **PO delete is drafts only again** (UI, handler and a database
  trigger); anything later is voided. When a new field or event is added to a PO table, add its label in `poHistory.js` (the trigger
  records new fields automatically, with a prettified name).
- **Payment batches:** each supervisor approval is recorded as a batch (`invoice_payment_batches`, `invoices.payment_batch_id`;
  `add_payment_batches.sql`, independent of the other invoice SQL): a name (theirs, or "Payment run <date>"), who and when. A single
  invoice approved from its PO page is a batch of one. The supervisor list shows "Recent payment batches" with paid progress; the
  Invoices-to-Pay list has a batch filter (with "x of y paid"), a Batch column and a CSV column; the PO's panel shows the batch.
  Approvals from before batches simply have none ("Approved before batches"). The app loads batches separately
  (`loadPaymentBatches`), so everything still works, just without batches, until the SQL is run.
- **Invoice approval flow:** invoice -> (receipt matched) -> **requisitioner reviews** -> **supervisor approves for payment**
  (batched) -> **accounting confirms paid** (date + reference) -> requisitioner closes the PO. `invoiceStage` in utils.js works the
  stage out from `invoices.reviewed / approved / paid / returned_at`; `canReviewInvoice`, `canApproveInvoice`, `canPayInvoice`,
  `canReturnInvoice` ... say who can do what. The supervisor step reuses the `invoice_approval` role (relabelled "Payment Approval" in
  Admin); the requisitioner is `request.requested_by` (admin can stand in). Either approver can **send back** with a reason (accounting
  resubmits or, if returned, deletes and re-uploads). The Invoice Matching role can now upload receipts too. Views: **My Invoices to
  Review** (`MyInvoicesToReviewTable`), **My Invoices for Payment Approval** (`MyInvoicesForApprovalTable`, tick + approve a batch),
  **My Invoices to Pay** (`MyInvoicesToPayTable`, `PaymentConfirm`, CSV of the list). The stage order is also enforced by a trigger on
  `invoices` (`add_invoice_approval_flow.sql`; run after `add_po_prepaid.sql`); before that SQL is run the app falls back to the old
  two-step flow (`invoiceFlowReady`). Existing approved invoices are backfilled as reviewed. Ledger CSV gained paid date and reference.
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
(needs `ownership_location_01_schema.sql` first), `add_po_invoice_email`, `add_ticket_code_link`, `add_parts_history`, `add_vendor_approval_guard`, `add_po_prepaid`, `add_invoice_approval_flow`, `add_payment_batches`, `add_po_history`, `add_vendor_deactivate`, `add_invoice_duplicate_guard`, `add_invoice_hold` (then re-run `add_po_history`), `add_transfer_po_request_stage` (after `add_transfer_pos`), `add_office_location`, `add_inventory_write_permission`, `add_part_datasheets`.

## What to build next

**The next big builds are on the payment / accounting side.** The user has said so but has not yet specified the
features, so ask what the first piece is before designing anything. Don't start the Accounting Audit tab yet; the user
has put it after this.

What exists today on that side, so new work extends it rather than duplicating it:

- **Invoices and receipts** are tables (`invoices`, `receipts`) hanging off a PO. An invoice is matched to a receipt
  (`InvoiceMatchChip`), reviewed by the requisitioner, approved for payment by a supervisor (`invoice_approval` role),
  then confirmed paid by accounting (`payment` role) -- see "Invoice approval flow" above. `payment_status` on the PO is a
  manual label; closing a PO (`canClosePo`, `allInvoicesFullyResolved`) requires every invoice paid (and, unless pre-paid,
  every receipt matched). Views: **My Invoices to Review**, **My Invoices for Payment Approval**, **My Invoices to Pay**
  (all with date sort/filter and totals).
- **Money on a PO:** line items, markup, shipping, credit, tax and currency (`computePoTotals`); Not to Exceed
  spending cap with `compareInvoicesToPo`; `chargeable_expense`; budget categories and sub-categories (a category is now
  required to save a draft); the invoice email address a PO tells vendors to use.
- **Reporting:** `PoLedgerTab` lists issued/closed POs with totals, ledger categories and CSV export.
- **Inter-entity charges:** stock transfers now create closed POs (sender as vendor, part Last Cost as price, payment left
  Unpaid). Nothing yet settles or reports on those.
- Open edges worth knowing: payment is recorded per invoice (date paid + reference, no method or amount paid), the supervisor
  approves in recorded batches (no batch-level payment confirmation), there is no accounting export beyond the ledger / invoices-to-pay CSVs, and the
  transfer POs have no budget category.

Other unfinished items, lower priority: the Accounting Audit tab (`AuditTab`) still runs on made-up data held in browser
memory, and is next after payments; the ownership/location cutover after the recount (check whether it has already
happened before touching it; PO receiving through the screen has not been exercised end to end); the presenter guide and
handout (`Projects/ticket-system/.claude/scratch/gcs-*.html`) don't cover the new tabs; draft POs have no "View PO"
preview; POs created from a ticket show the old `TK-00042` label; Change History is visible only to inventory editors;
this README should be replaced.
