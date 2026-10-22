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

- **Verify before saying done:** run `npx vite build` (it does NOT catch a variable that was never imported or passed in -- that is a white screen at runtime; also run `npx oxlint src -D no-undef` and ignore the browser globals it lists like document/console/TextEncoder, and render the tab you touched with the harness below); for database logic, replay `build/test_copy/1_schema.sql` +
  `2_seed.sql` + the new SQL in PGlite (in-memory Postgres; a working harness is in
  `Projects/ticket-system/.claude/scratch/harness`, which can also render the real tabs with a fake Supabase client).
- Some files use CRLF line endings (`OwnershipTab`, `PhysicalLocationTab`, `utils.js`, ...). Edit in a way that
  preserves each file's endings; the git "LF will be replaced by CRLF" warnings are normal.
- The user has said to commit and push to `main` once a change is verified, without asking. End commit messages with the
  `Co-Authored-By` line the harness gives you.
- Don't hardcode what an admin might change, and don't put credentials in files or chat.

## Recent work (refinement of the inventory system)

Most recent first, all on `main`:

- **Splitting an invoice across POs, and linking POs:** a vendor often invoices more than the PO (shipping added afterwards) and a second PO is raised for the difference. When an invoice PDF is added (`InvoiceReview`) the line items read off it (`src/invoiceSplit.js`: `invoiceItemRows` -- each item, markup, and **shipping as an item of its own**, or "everything except shipping" when no items could be read) are listed with tick boxes: the person untick what belongs on another PO and the Invoice Amount follows (`allocateInvoice`: ticked items + the invoice's tax rate on them; everything ticked = the document's own total). Each PO still has its own `invoices` row and file; a partial one also stores `invoice_total` (the whole invoice) and `covers` (the items taken), shown under the invoice on the PO and in History. If the same invoice number from the vendor is already on another PO, a checkbox "same invoice, split across POs" replaces the typed reason (the reason is written for them: "Same invoice split across POs (shared with PO-...)"), refuses to take the whole invoice, and shows how much the other POs already hold against the total. **Related POs** (`tabs/RelatedPos.jsx`, on every non-draft PO page): POs sharing an invoice number with the same vendor appear automatically (`relatedRequests`), and POs can be linked by hand by PO number (`purchase_request_links`, `handleAddPoLink` / `handleRemovePoLink`, noted in both POs' activity logs; `canLinkPos`). `add_po_links_and_invoice_split.sql` (after `add_invoice_duplicate_guard`); until it is run partial invoices are refused with a message to run it, and the manual link box is hidden. Not done: the PO-vs-invoice checklist still compares the whole invoice, and the second PO is still raised by hand.
- **Location only where it makes sense:** a location that is only the site again (a ground-mount site's one location, e.g. "Alfred" under "SunE Alfred LP"; `locationIsSiteItself` in utils.js compares the names ignoring SunE / LP / Solar / spacing, Highway = Hwy) is never asked for or shown; it is saved on the PO automatically (`subProjectToSave` in App.jsx). A site with any other location (Firelight Solar's rooftops, even if it has only one so far -- `siteNeedsLocation`) has to pick one, and it shows on the PO page and in the PO list under the Site (`locationVisible(request)`). The PO document itself (printed view and PDF) is the same for every site: a **Location** row in the header table (the saved location, or the site if none was saved) and no "Site:" line under the line items; the vendor email lists a Location line whenever one is saved. A ticket link that names both a site and a location uses the location's own site. New POs also start with no site picked once projects are set up (they used to start on whichever site was selected on the inventory screens, which was Firelight Operations LP). Fixed in passing: the ledger CSV's old `Project` column (the location) is now `Location`, so it no longer clashes with the real Project column.
- **Projects (top layer), Sites, Locations -- a re-wording of the whole site:** a new top layer called **Project** (Regular O&M, Repower - Phase 1, Repower - Phase 2; in the database the table is `programs`, because `projects` was already taken) sits above the **Sites**. What the site used to call an **Entity** (the `projects` table) is now a **Site** everywhere a person reads it (code names like `projects`, `project_id`, `entity_scopes` are unchanged), and the old optional second dropdown (`sub_projects`, e.g. Firelight's rooftop sites) is now a **Location**. `add_projects_layer.sql` (run after `add_budget_categories`, `add_transfer_po_request_stage` and `add_office_location`; supersedes `add_transfer_po_budget_category`): `programs` (name, `invoice_email`, `tracks_inventory`, `sort_order`), `program_sites` (a site can be in several projects), `budget_categories.program_id` (names are now unique per project, not overall) and `purchase_requests.program_id`; seeds the three projects, puts every existing site in Regular O&M, renames FLOPS to Firelight Operations LP, matches the repower sites by name and creates 378 Elgin / 6 Manchester, makes every existing category a Regular O&M one (a category with "repower" in its name is deleted if unused, else moved to Phase 1) and seeds both repower category lists; the trigger `fn_po_program_guard` requires a PO's site and category to belong to its project; `inv_private.create_transfer_po` now writes Regular O&M POs in that project's Inventory category. App: the PO form asks for the **Project** first and filters Site and Budget Category by it; the invoice email is taken from the project (`programs.invoice_email`, editable in Admin, read-only on the form); the PO list, ledger, PDF, vendor email, History and printed PO show the project; the stock screens (Required Inventory, Ownership, Physical Location) only list the sites of a project that `tracks_inventory` (`inventoryProjects` in App.jsx); Admin has a **Projects** card (name, email, keeps-inventory, which sites) and the category / site tables show projects. Until the SQL is run `programs` is empty (`programsReady` false) and everything behaves as before, apart from the new words. Admin Excel: sheets are now `Sites` and `Locations` (old `Entities` / `Projects` sheets still import), categories and sub-categories carry a `Project` column (blank = Regular O&M), the CSV exports say Site instead of Entity (Ownership import accepts either). Not changed: the ticket system, whose own screens still say Entity.
- **Pre-paid POs with spare parts must be Received before closing; yellow "on order" units on Physical Location too:** (1) `isWorkFullyDone` no longer treats "Pre-paid" as done when the PO has spare part lines (`hasSparePartLines`), so the requisitioner has to set Parts status to Received -- which runs `fn_receive_po_parts` and adds the units to stock -- before Close PO appears (the PO page says so; the next step reads "Receive/Complete"); pre-paid POs with no spare lines still close as before. `add_prepaid_close_guard.sql` (after `add_po_prepaid.sql`) enforces the same in the database. (2) Spares on issued, not-yet-received POs (`incomingStockByKey`) now also show in yellow on the Physical Location tab, added to the cell where they will land (the entity's own site, or Oshawa if it has none) and to the Total; hidden while moving or recording use, which work on real stock only. Shared colour `INCOMING_BG` in stockUtils.js.
- **Dollar amounts are comma-separated everywhere:** `formatMoney` ("$1,234.50", negatives "-$2,500.00") and `formatAmount` (the bare "1,234.50", for a column whose heading says it is money) in utils.js are the only way money is shown -- never `toFixed(2)` or `toLocaleString()` on an amount for display, including the PO PDF, the vendor email body and the activity log text. CSV exports deliberately keep plain numbers ("1234.50") so Excel can add them up; number input boxes can't hold commas.
- **Dates are yyyy/mm/dd everywhere:** `formatDate` / `formatDateTime` (utils.js; times are 24-hour hh:mm) are the only way a date or timestamp is shown -- never `toLocaleDateString` / `toLocaleString` on a date. They take a Date, an ISO timestamp or a yyyy-mm-dd date column. The browser's own date picker follows the computer's language settings, so every date filter / entry box now uses `tabs/DateInput.jsx` (a typed yyyy/mm/dd box plus a calendar button; its value and `onChange` are still yyyy-mm-dd, so it replaces `<input type="date">` one for one; `parseTypedDate` in utils.js). Left as they were on purpose: file names of downloads (yyyy-mm-dd, slashes aren't allowed), the PO History CSV's `When (UTC)` column (raw UTC timestamp for the audit trail), `localDay` (an internal yyyy-mm-dd key), and the stored names of past payment batches ("Payment run 2026-10-15"; new ones are called "Approved invoice batch yyyy/mm/dd").
- **Invoice hold at the requisitioner's review:** the requisitioner (the PO's requester; admin can stand in) can now put an invoice **on hold** while it waits for their review, with a reason, like the supervisor can at payment approval. Held at review it can't be approved by the requisitioner until released (Hold / Release buttons in the PO's Receipts & Invoices panel and in **My Invoices to Review**, which flags it "On hold" with the reason); Send Back still works and clears the hold; held ones don't count in the nav badge. `canHoldInvoice` / `canReleaseInvoice` in utils.js are now stage-aware (requisitioner at `review`, supervisor at `payment_approval` / `to_pay`). `add_invoice_hold_at_review.sql` (after `add_invoice_hold.sql`; no need to re-run `add_po_history.sql`) replaces `fn_invoice_hold_guard`: a hold needs a matched receipt or pre-paid PO, not paid, not sent back; a held invoice can't be reviewed, approved or paid. Until it is run the old rule applies and holding an invoice at review is refused by the database.
- **Vendor contacted marker:** an issued PO shows whether the vendor has been told: green "Vendor contacted" (who, when, and whether by Email Vendor or by hand) or amber "Not contacted" (list: under the Status word; PO page: beside the Email Vendor button). Pressing **Email Vendor** sets it automatically (first time only); **Mark vendor contacted / Clear contacted** buttons do it by hand for a call or an email sent outside the site. Same people who can issue the PO (`canMarkVendorContacted`). `purchase_requests.vendor_contacted_at/_by/_how` (`add_vendor_contacted.sql`, any time after `add_po_history.sql`); the trigger `fn_vendor_contacted_stamp` stamps the real time and user. Handler `handleSetVendorContacted` in App.jsx, `VendorContactedBadge` in PurchaseOrdersTab. Existing POs start unmarked (so old issued POs show amber until someone marks them). Hidden until the SQL is run (`vendorContactReady`).
- **Transfer POs get the budget category "Inventory":** `add_transfer_po_budget_category.sql` (run after `add_transfer_po_request_stage.sql`) replaces `inv_private.create_transfer_po` so the PO a Stock Transfer writes carries the category named Inventory (found by name ignoring case, created if missing, so an admin can rename or re-point it under Admin). Only new transfers; older transfer POs keep no category.
- **One-off clean-up scripts (not migrations):** `supabase/reset_purchase_orders.sql` deletes every PO (with lines, invoices, receipts, activity), payment batches, the
  whole PO History and the PO number counters, and restarts ids at 1; it does nothing until its first line is changed to `true`, pauses and then restores the
  PO History protections, and leaves parts, stock, vendors, users and the inventory History alone. Uploaded PDFs in Storage and ticket-system links to the deleted POs are
  not touched. `restore_parts_after_blank_import.sql` refills Manufacturer / Mfr Part # / Category from `parts_history` after an import that blanked them.
- **Suggestions tab:** every signed-in user (not vendor logons) has a **Suggestions** tab to send in something broken / disliked / an idea (type, page of the site, text);
  `suggestions` table, `add_suggestions.sql` (needs the security files for `is_app_admin()` / `is_active_app_user()`). Only the admin sees everyone's, in a list
  filtered by status (New / Looking at it / Planned / Done / Won't do), with a reply box (the sender sees the status and reply on their own list), delete and CSV
  export; the admin's tab shows a badge with the count of New ones (`refreshSuggestionCount` in App.jsx). Who sent it and when are stamped by the trigger
  `fn_suggestion_stamp`, not the browser; new ones always start as New. `SuggestionsTab.jsx`. Until the SQL is run the tab says to run it.
- **Part descriptions are three lines:** (1) what it is -- a generic term (Relay, Contactor, Circuit Breaker, Fuse ...), (2) model and ratings, (3) anything else
  (optional), kept in the one `parts.description` field with line breaks. Lists show them with `PartDescription` (three blocks: what it is in bold, model and rating, other details muted; an old one-line
  description shows plain; `.desc-lines` is the plain pre-line fallback used on PO lines) and the Master List
  edits them in a 3-row textarea; one-line places use `descriptionOneLine`. Import List/Export List carry the line breaks in a quoted CSV cell. The existing 378
  descriptions were redrafted into this form (review workbook `build/description_review/master-list-descriptions-review.xlsx` with a Status/Note per part; 60 parts
  still carry a question for someone who knows the parts; not committed). **Import List now only changes the columns the file has** (a file with just GCS P/N and
  Description changes only descriptions), so `master-list-descriptions-IMPORT.csv` (377 rows, new text) and `...-ORIGINAL-rollback.csv` (old text) in that folder can
  be imported without touching Manufacturer / Mfr Part # / Category. They were built from the repo's test-database snapshot, so P/N 379 (live only) is not in them.
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
  `add_payment_batches.sql`, independent of the other invoice SQL): a name (theirs, or "Approved invoice batch <date>" -- not "payment run", since the invoices are only approved, not paid), who and when. A single
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
  ("Pre-paid", which `isWorkFullyDone` counts as done unless the PO has spare lines -- see the newer entry above), so a PO without spares can close without the parts being marked Received; spares have to be received (`partsStatusForPrepaid`, `partsStatusOptions`). The SQL also
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
(needs `ownership_location_01_schema.sql` first), `add_po_invoice_email`, `add_ticket_code_link`, `add_parts_history`, `add_vendor_approval_guard`, `add_po_prepaid`, `add_invoice_approval_flow`, `add_payment_batches`, `add_po_history`, `add_vendor_deactivate`, `add_invoice_duplicate_guard`, `add_invoice_hold` (then re-run `add_po_history`), `add_transfer_po_request_stage` (after `add_transfer_pos`), `add_office_location`, `add_inventory_write_permission`, `add_part_datasheets`, `add_transfer_po_budget_category` (after `add_transfer_po_request_stage`), `add_vendor_contacted`, `add_invoice_hold_at_review` (after `add_invoice_hold`), `add_prepaid_close_guard` (after `add_po_prepaid`), `add_projects_layer` (last: after `add_office_location` and `add_transfer_po_request_stage`), `add_po_links_and_invoice_split` (after `add_invoice_duplicate_guard`).

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
