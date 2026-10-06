export const TICKETING_URL = 'https://ticket-system-gcs14.vercel.app'

// Inventory journal History tab -- one label per distinct action that can
// write a journal entry, so the Type column actually reflects what happened
// instead of collapsing everything down to "Adjustment".
export const JOURNAL_ENTRY_TYPE_LABELS = {
  adjustment: 'Adjustment',
  location_adjustment: 'Location Adjustment',
  use: 'Part Use',
  transfer: 'Transfer',
  count: 'Inventory Count',
  po_received: 'PO Received',
}

export function journalEntryTypeLabel(entryType) {
  return JOURNAL_ENTRY_TYPE_LABELS[entryType] || 'Adjustment'
}

export const emptyFilters = {
  gcs_id: '',
  gcs_part_id: '',
  manufacturer_part_number: '',
  manufacturer: '',
  spare_category: '',
  used_by: '',
  description: '',
}

export const blankDraftRow = () => ({
  _existing: false,
  _tempId: crypto.randomUUID(),
  gcs_part_id: '',
  manufacturer_part_number: '',
  manufacturer: '',
  spare_category: '',
  description: '',
  last_cost: '250',
})

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function shortProjectName(name) {
  return (name || '').replace(/^SunE\s+/, '').replace(/\s+LP$/, '')
}

export function truncate(str, maxLen) {
  if (!str) return str
  return str.length > maxLen ? str.slice(0, maxLen - 1).trimEnd() + '…' : str
}

// Unshared requirements each need their own dedicated unit, so they add up.
// Shared requirements can all be met by the same pooled unit, so only the
// largest one adds to the total (a part is still needed somewhere even if
// every project that wants it is happy to share).
export function computeTargetSum(values) {
  const unsharedSum = values.reduce((sum, p) => sum + (!p.shared ? p.target ?? 0 : 0), 0)
  const sharedMax = values.reduce((max, p) => (p.shared ? Math.max(max, p.target ?? 0) : max), 0)
  return unsharedSum + sharedMax
}

export function normalizeHeader(h) {
  return (h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// --- Purchase Orders ---

export const PO_STATUS_ORDER = ['draft', 'submitted', 'approved', 'issued', 'closed', 'rejected', 'voided']

export const PO_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Requested',
  approved: 'Approved',
  issued: 'PO Issued',
  closed: 'Closed',
  rejected: 'Rejected',
  voided: 'Voided',
}

export function poStatusLabel(status) {
  return PO_STATUS_LABELS[status] || status
}

export const WORK_STATUS_LABELS = {
  not_started: 'Not Started',
  partial: 'Partially Complete',
  complete: 'Complete',
  not_ordered: 'Not Ordered',
  ordered: 'Ordered',
  partially_received: 'Partially Received',
  received: 'Received',
}

// Purchase POs track ordering/receiving a physical part; Service (and Not to
// Exceed) POs track doing the work -- different vocabulary, same column and
// same "PO Status" label, so a Purchase PO never offers "Complete" and a
// Service PO never offers "Ordered".
export const PARTS_STATUS_OPTIONS = ['not_ordered', 'ordered', 'partially_received', 'received']
export const SERVICE_STATUS_OPTIONS = ['not_started', 'partial', 'complete']

export function statusOptions(values) {
  return values.map((value) => ({ value, label: WORK_STATUS_LABELS[value] }))
}

export function workStatusLabel(workStatus) {
  return WORK_STATUS_LABELS[workStatus] || workStatus
}

export const PAYMENT_STATUS_LABELS = {
  unpaid: 'Unpaid',
  partial: 'Partially Paid',
  paid: 'Paid',
}

export function paymentStatusLabel(paymentStatus) {
  return PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus
}

// A PO can hold part lines, service lines, or both, and tracks each kind on
// its own: parts are ordered and received, services are started and completed.
// A marker only applies when the PO actually has lines of that kind.
export function linesHaveParts(lines) {
  return (lines || []).some((l) => l.line_type === 'part')
}

export function linesHaveServices(lines) {
  return (lines || []).some((l) => l.line_type === 'service')
}

export function poHasParts(request) {
  return linesHaveParts(request?.purchase_request_lines)
}

export function poHasServices(request) {
  return linesHaveServices(request?.purchase_request_lines)
}

export function partsStatus(request) {
  return request?.parts_status || 'not_ordered'
}

export function serviceStatus(request) {
  return request?.service_status || 'not_started'
}

// The status marker(s) that apply to this PO, in display order. One entry for a
// parts-only or service-only PO, two for a mixed one, none while it has no lines.
export function workStatusEntries(request) {
  const entries = []
  if (poHasParts(request)) entries.push({ kind: 'parts', label: 'Parts', status: partsStatus(request) })
  if (poHasServices(request)) entries.push({ kind: 'service', label: 'Service', status: serviceStatus(request) })
  return entries
}

// Every kind of work on the PO is at its "done" end: all parts received and
// all services complete. Closing a PO, the progress stepper and "what's next"
// all go through this.
export function isWorkFullyDone(request) {
  const entries = workStatusEntries(request)
  if (entries.length === 0) return false
  return entries.every((e) => (e.kind === 'parts' ? e.status === 'received' : e.status === 'complete'))
}

export function computePaymentStatus(request) {
  return request?.payment_status || 'unpaid'
}

// Payment Status can only be set to 'paid' once every invoice actually on
// file is marked paid -- otherwise the label would claim something the
// Receipts & Invoices table doesn't back up. Requires at least one invoice,
// same reasoning as allInvoicesFullyResolved below.
export function canMarkPaymentPaid(request) {
  const invoices = request?.invoices || []
  return invoices.length > 0 && invoices.every((inv) => inv.paid)
}

// Every receipt has been matched to an invoice, every invoice has been
// matched to a receipt, and every invoice has been approved and paid -- i.e.
// nothing is left dangling. Requires at least one of each so an empty PO
// can't be closed with nothing on file.
export function allInvoicesFullyResolved(request) {
  const invoices = request?.invoices || []
  const receipts = request?.receipts || []
  if (invoices.length === 0 || receipts.length === 0) return false
  const matchedReceiptIds = new Set(invoices.filter((inv) => inv.matched_receipt_id).map((inv) => inv.matched_receipt_id))
  const allReceiptsMatched = receipts.every((r) => matchedReceiptIds.has(r.id))
  const allInvoicesResolved = invoices.every((inv) => inv.matched_receipt_id && inv.approved && inv.paid)
  return allReceiptsMatched && allInvoicesResolved
}

// The original requester (or, for a service PO, the PO's own vendor-user)
// does the final close once Work Status and Payment Status are both
// manually confirmed AND the underlying receipts/invoices records back that
// up (every one matched, approved, and paid) -- the manual labels alone
// aren't enough, since someone could otherwise close a PO still marked
// Unpaid.
export function canClosePo(user, request) {
  return (
    canConfirmReceipt(user, request) &&
    request?.status === 'issued' &&
    isWorkFullyDone(request) &&
    computePaymentStatus(request) === 'paid' &&
    allInvoicesFullyResolved(request)
  )
}

// Purely a display concept -- 'issued' expands into two extra stepper/badge
// stages driven by the manual Work Status / Payment Status dropdowns, since
// there's no real status value for "issued but nothing done yet" vs. "issued
// and fully done, just not closed." The real `status` column never holds
// 'in_progress' or 'paid'.
export const PO_PROGRESS_STAGES = ['submitted', 'approved', 'issued', 'in_progress', 'paid', 'closed']

export const PO_PROGRESS_STAGE_LABELS = {
  submitted: 'Requested',
  approved: 'Approved',
  issued: 'PO Issued',
  in_progress: 'In Progress',
  paid: 'Paid',
  closed: 'Closed',
}

export function computePoProgressStage(request) {
  if (request?.status !== 'issued') return request?.status
  const workDone = isWorkFullyDone(request)
  const paid = computePaymentStatus(request) === 'paid'
  return workDone && paid ? 'paid' : 'in_progress'
}

// Not to Exceed is a checkbox that only means anything while the PO has
// service lines; this guards against a stale flag left on a request whose
// services were removed.
export function isNotToExceed(request) {
  return poHasServices(request) && Boolean(request?.not_to_exceed)
}

// How what's been invoiced compares with the PO: the PO's grand total, or --
// for a Not to Exceed PO with a cap set -- the cap. Null until there is an
// invoice. state is 'over' | 'under' | 'equal' (to the cent).
export function compareInvoicesToPo(request) {
  const invoices = request?.invoices || []
  if (invoices.length === 0) return null
  const cents = (n) => Math.round((Number(n) || 0) * 100)
  const cap = isNotToExceed(request) ? Number(request.spending_cap) || 0 : 0
  const basis = cap > 0 ? 'cap' : 'po'
  const invoiced = cents(computeInvoicedTotal(request))
  const expected = cents(basis === 'cap' ? cap : computePoTotals(request).grandTotal)
  const diff = invoiced - expected
  return {
    invoiced: invoiced / 100,
    expected: expected / 100,
    diff: diff / 100,
    state: diff > 0 ? 'over' : diff < 0 ? 'under' : 'equal',
    basis,
  }
}

const moneyText = (n) => `$${Number(n).toFixed(2)}`

// The sentence behind the invoice indicator, for its hover text.
export function invoiceMatchText(match) {
  const against = match.basis === 'cap' ? 'spending cap' : 'PO total'
  const gap =
    match.state === 'equal' ? 'matches' : `${moneyText(Math.abs(match.diff))} ${match.state === 'over' ? 'over' : 'under'}`
  return `Invoiced ${moneyText(match.invoiced)} against the ${against} of ${moneyText(match.expected)} — ${gap}`
}

// Spare parts on issued POs whose parts haven't all been received: they're
// already counted in the inventory view (flagged as not on the shelf yet) but
// only join real stock when the parts are marked received. Keyed
// "projectId:partGcsId" -> { qty, pos: [{ label, qty }] }.
export function incomingStockByKey(requests) {
  const map = new Map()
  for (const r of requests || []) {
    if (r.status !== 'issued' || partsStatus(r) === 'received') continue
    const label = r.po_number || `#${r.id}`
    for (const l of r.purchase_request_lines || []) {
      if (!lineCountsInStock(l)) continue
      const qty = Number(l.quantity) || 0
      if (qty <= 0) continue
      const key = `${r.project_id}:${l.part_gcs_id}`
      const entry = map.get(key) || { qty: 0, pos: [] }
      entry.qty += qty
      const existing = entry.pos.find((p) => p.label === label)
      if (existing) existing.qty += qty
      else entry.pos.push({ label, qty })
      map.set(key, entry)
    }
  }
  return map
}

// Sum of every invoice on file for a request, regardless of approval/paid
// state -- what's actually been billed against it so far.
export function computeInvoicedTotal(request) {
  const invoices = request?.invoices || []
  return invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
}

// Only meaningful for a Not to Exceed PO with a cap set -- flags once
// invoiced amounts run past it, so accounting/the requester can catch it
// regardless of how many invoices are still unapproved or unpaid.
export function isOverSpendingCap(request) {
  if (!isNotToExceed(request)) return false
  const cap = Number(request?.spending_cap)
  if (!cap) return false
  return computeInvoicedTotal(request) > cap
}

// One role per step of the PO process, plus the other roles the app needs.
// Strictly additive, same as before -- admin only grants Admin-tab editing,
// not any of these. 'purchase_rec_approval' and 'po_issue' can additionally
// be scoped to specific entities (see ENTITY_SCOPED_ROLES below); every
// other role here is company-wide.
export const PO_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'ticketing', label: 'Ticketing' },
  { value: 'purchase_req', label: 'Purchase Rec' },
  { value: 'purchase_rec_approval', label: 'Purchase Rec Approval' },
  { value: 'po_issue', label: 'PO Issue' },
  { value: 'invoice_matching', label: 'Invoice Matching' },
  { value: 'invoice_approval', label: 'Invoice Approval' },
  { value: 'payment', label: 'Payment' },
  { value: 'vendor_approval', label: 'Vendor Approval' },
]

// Roles whose access can be narrowed to specific entities via the Users
// tab's "Entity Assignments" table (user_role_entities). A role holder with
// no rows there sees every entity, same as before this existed.
export const ENTITY_SCOPED_ROLES = [
  'purchase_req',
  'purchase_rec_approval',
  'po_issue',
  'invoice_matching',
  'invoice_approval',
  'payment',
]

// How a part line relates to inventory. Parts can't be added to an entity's
// inventory list from a PO -- that stays a guarded, separate job -- so a part
// line is one of:
//   spare       a part already on the entity's list, kept as a spare:
//               receiving the PO adds it to stock
//   used        a part on the entity's list that is used straight away (e.g.
//               in the service on the same PO): never added to stock
//   consumable  anything else that isn't tracked: free text, no master-list
//               link, and capped per unit (CONSUMABLE_MAX_UNIT_COST)
// A part that is neither on the list nor a consumable belongs in a service
// line instead.
export const CONSUMABLE_MAX_UNIT_COST = 1000

// inventory_mode is the draft's choice ('spare' | 'used' | 'consumable', or ''
// when a line still has to be answered); inventory_action is the stored form.
export const INVENTORY_MODE_TO_ACTION = {
  spare: 'spare',
  used: 'used_immediately',
  consumable: 'consumable',
}

export const INVENTORY_ACTION_TO_MODE = {
  spare: 'spare',
  add_existing: 'spare', // older "list part not on the entity's list" -- still a part to count
  used_immediately: 'used',
  consumable: 'consumable',
}

export const blankPurchaseRequestLine = (lineType = 'part') => ({
  _tempId: crypto.randomUUID(),
  line_type: lineType,
  part_gcs_id: null,
  description: '',
  quantity: '1',
  unit_cost: '',
  partSearch: '',
  inventory_mode: 'spare',
  vendor_part_number: '',
})

// Has anything been entered on a draft part line at all? (The untouched
// default line is not "content" -- it just isn't saved.)
export function partLineHasContent(line) {
  return Boolean(
    line.part_gcs_id ||
      (line.description || '').trim() ||
      (line.vendor_part_number || '').trim() ||
      Number(line.unit_cost) > 0
  )
}

// A consumable over the per-unit cap is not allowed -- it would be a real
// part being waved past the inventory counters.
export function consumableOverCap(line) {
  return line.inventory_mode === 'consumable' && Number(line.unit_cost) > CONSUMABLE_MAX_UNIT_COST
}

// Has the person said how this part line relates to inventory? Every part
// line with content has to answer that -- it can't just be left unlinked,
// because that is how a part that needs counting gets skipped.
export function partLineIsComplete(line) {
  if (line.inventory_mode === 'consumable') {
    return Boolean((line.description || '').trim()) && !consumableOverCap(line)
  }
  if (line.inventory_mode === 'spare' || line.inventory_mode === 'used') return Boolean(line.part_gcs_id)
  return false
}

// Does receiving this saved part line add it to stock? Only spares do; a line
// with no action at all is an older ordinary list part and counted as before.
export function lineCountsInStock(line) {
  if (line.line_type !== 'part' || !line.part_gcs_id) return false
  return !['used_immediately', 'consumable'].includes(line.inventory_action)
}

// One line of plain English about what a saved part line does with inventory,
// for the approver and the PO detail view. `received` is whether the PO's
// parts have been received yet. Null for service lines.
export function describeLineInventory(line, entityName, received) {
  if (line.line_type !== 'part') return null
  const where = entityName ? `${entityName}'s inventory` : "the entity's inventory"
  switch (line.inventory_action) {
    case 'used_immediately':
      return 'Used immediately — not added to inventory'
    case 'consumable':
      return 'Consumable — not tracked in inventory'
    case 'add_new':
    case 'not_tracked':
      return 'Uses an older inventory option that no longer exists — edit the request and choose Spare, Used immediately or Consumable'
    default:
      return line.part_gcs_id ? (received ? `Added to ${where} as a spare` : `Spare — added to ${where} when received`) : null
  }
}

// A user's `name` is their login email (it's what sign-in and the ticket
// system match on), so it can't be reworded. `display_name` is the friendly
// name an admin gives them, shown anywhere a person is named; people without
// one still show their email.
export function userDisplayName(user) {
  return (user?.display_name || '').trim() || user?.name || ''
}

export function findUserName(users, id) {
  if (!id) return '—'
  const user = users.find((u) => u.id === id)
  return (user && userDisplayName(user)) || '—'
}

// What goes on a PO's "Authorized by" line: whoever approved the request, their
// saved signature image (if they've drawn/uploaded one) and when they approved.
// Null until the request has been approved.
export function approvalStamp(users, request) {
  if (!request?.approved_by) return null
  const user = (users || []).find((u) => u.id === request.approved_by)
  return {
    name: user ? userDisplayName(user) : '',
    signature: user?.signature || null,
    date: request.approved_at ? new Date(request.approved_at) : null,
  }
}

// Roles are strictly additive and independent — admin included. Admin only
// grants Admin-tab editing; it does NOT imply any other capability, so a
// user who should also approve, receive, etc. needs those roles ticked too.
export function userHasRole(user, role) {
  if (!user?.roles) return false
  return user.roles.includes(role)
}

export function isAdmin(user) {
  return userHasRole(user, 'admin')
}

// A vendor-logon account (managed from the Vendors table, not the Users
// table) — only ever sees the Purchase Orders tab, and only their own
// vendor's actually-issued POs. No other role check ever grants this.
export function isVendorUser(user) {
  return userHasRole(user, 'vendor')
}

// Can edit the Master List / Required Inventory / Inventory On Hand.
export function canEditInventory(user) {
  return userHasRole(user, 'inventory')
}

// `projectId` is optional -- omit it to just ask whether the user holds the
// role at all (showing the New Request button), pass it to also check the
// entity against their assignments.
export function canCreatePurchaseRequests(user, projectId) {
  if (!userHasRole(user, 'purchase_req')) return false
  if (projectId === undefined || projectId === null) return true
  return isEntityAllowed(user, 'purchase_req', projectId)
}

// The entities a user may act on for a role -- everything when they have no
// assignments for it.
export function entitiesAllowedFor(user, role, projects) {
  return (projects || []).filter((p) => isEntityAllowed(user, role, p.id))
}

// A draft stays editable by anyone who can create requests (matching how
// "Edit Draft" always worked). Once submitted, only the original requester
// (or an admin) can still adjust it -- most useful while an approver has put
// it on hold and is waiting on a fix, since otherwise a hold would just be a
// dead end with no way to act on the reason for it.
export function canEditPurchaseRequest(user, request) {
  if (!request) return false
  if (request.status === 'draft') return canCreatePurchaseRequests(user, request.project_id)
  if (request.status === 'submitted') return isAdmin(user) || user?.id === request.requested_by
  return false
}

// A PO past draft is never hard-deleted -- it's voided, so the row, its
// activity log and its invoices stay on file for accounting. Admin-only, same
// as delete was. Refused once stock or money has moved: parts received (stock
// was already added) or any invoice/receipt on file -- those have to be
// reversed first. A closed PO is finished, so it can't be voided either.
export function voidBlockReason(user, request) {
  if (!request || !isAdmin(user)) return 'Only an admin can void a PO.'
  if (['draft', 'voided', 'closed'].includes(request.status)) return 'This PO cannot be voided.'
  if (poHasParts(request) && request.received_at) {
    return 'Its parts have been received into stock — reverse that with an inventory adjustment first.'
  }
  if ((request.invoices || []).length > 0 || (request.receipts || []).length > 0) {
    return 'It has invoices or receipts on file — remove them first.'
  }
  return null
}

// The PO Ledger is for accounting only: anyone holding invoice matching,
// invoice approval or payment. Company-wide view -- the ledger isn't narrowed
// by entity assignment, since accounting reconciles across every entity.
//
// Switched off for now (not yet known whether accounting wants it): the tab
// button, the tab itself and the access guard in App.jsx all go through this,
// so flipping PO_LEDGER_ENABLED back to true is all it takes to bring it back.
export const PO_LEDGER_ENABLED = false

export function canViewPoLedger(user) {
  if (!PO_LEDGER_ENABLED) return false
  return (
    userHasRole(user, 'invoice_matching') ||
    userHasRole(user, 'invoice_approval') ||
    userHasRole(user, 'payment')
  )
}

// Which bucket a PO line falls in for the PO Ledger, derived from how it was
// set up. Deliberately plain descriptions of what happened to the item, not
// accounting classifications (asset vs expense) -- accounting decides that.
export const LEDGER_CATEGORY_LABELS = {
  inventory: 'Inventory (spare)',
  used: 'Used on site',
  consumable: 'Consumable',
  service: 'Service',
}

export function lineLedgerCategory(line) {
  if (line.line_type === 'service') return 'service'
  if (line.inventory_action === 'used_immediately') return 'used'
  if (line.inventory_action === 'consumable') return 'consumable'
  return 'inventory'
}

// A rejected request is sent back to the person who submitted it (or an admin),
// who returns it to a draft to fix and submit again.
export function canReopenRejected(user, request) {
  if (request?.status !== 'rejected') return false
  return isAdmin(user) || (Boolean(user?.id) && user.id === request.requested_by)
}

// Its own explicit role now, decoupled from Purchase Rec -- only used to
// decide whether to show the "Ticketing" link; the ticket system re-checks
// eligibility itself on login regardless.
export function canAccessTicketing(user) {
  return isAdmin(user) || userHasRole(user, 'ticketing') || isVendorUser(user)
}

// A user's entity_scopes field (attached by App.jsx from the
// user_role_entities table) maps role -> array of project ids they're
// scoped to. No rows for that role = unscoped = every entity, so granting
// an entity-scoped role doesn't silently lock someone out until an admin
// gets around to assigning entities.
export function isEntityAllowed(user, role, projectId) {
  const scope = user?.entity_scopes?.[role]
  if (!scope || scope.length === 0) return true
  return scope.includes(projectId)
}

// `request` is optional -- omit it to just check whether the user holds the
// role at all (e.g. deciding whether to show a tab), pass it to also check
// that specific request's entity against their assigned scope.
//
// Someone holding the role can approve their own requests too, for now.
export function canApproveRequests(user, request) {
  if (!userHasRole(user, 'purchase_rec_approval')) return false
  if (!request) return true
  return isEntityAllowed(user, 'purchase_rec_approval', request.project_id)
}

export function canIssuePurchaseOrder(user, request) {
  if (!userHasRole(user, 'po_issue')) return false
  if (!request) return true
  return isEntityAllowed(user, 'po_issue', request.project_id)
}

// Whoever created the purchase request is the one who must confirm its
// receipt (Work Status) and the one who can add receipts to the new
// Receipts & Invoices table below — not just anyone holding the general
// "receive" role. For a service PO, the vendor who did the work can also
// upload the service report / a receipt themselves (a parts receipt/photo
// still stays internal-only, since the vendor isn't the one physically
// receiving the parts).
export function canConfirmReceipt(user, request) {
  if (user?.id && user.id === request?.requested_by) return true
  if (isVendorUser(user) && poHasServices(request) && !poHasParts(request) && user?.vendor_id === request?.vendor_id) {
    return true
  }
  return false
}

// Approving or rejecting a vendor someone asked for -- its own company-wide
// role (a vendor isn't tied to one entity). Admin doesn't imply it, same as
// every other role here.
export function canApproveVendors(user) {
  return userHasRole(user, 'vendor_approval')
}

// Vendors that existed before approval did, and ones an admin adds directly,
// have no approval_status of their own to speak of -- they count as approved.
export function vendorApprovalStatus(vendor) {
  return vendor?.approval_status || 'approved'
}

// Why a request can't go forward on this vendor yet, or null if it can.
export function vendorBlockReason(vendor) {
  const status = vendorApprovalStatus(vendor)
  if (status === 'pending') return `${vendor.name} is still pending approval as a vendor.`
  if (status === 'rejected') {
    return `${vendor.name} was rejected as a vendor${vendor.rejection_reason ? ` (${vendor.rejection_reason})` : ''} — choose another vendor.`
  }
  return null
}

// Adding an invoice and matching it to a receipt -- its own role, separate
// from approving or paying it.
export function canMatchInvoices(user, request) {
  if (!userHasRole(user, 'invoice_matching')) return false
  return !request || isEntityAllowed(user, 'invoice_matching', request.project_id)
}

// Approving a matched invoice/receipt pair -- company-wide, not scoped to
// whoever happened to approve that PO's original requisition. Only matters
// once accounting has actually paired an invoice with a receipt (an
// unmatched invoice has nothing to approve yet).
export function canApproveInvoice(user, invoice, request) {
  if (!invoice?.matched_receipt_id) return false
  if (!userHasRole(user, 'invoice_approval')) return false
  return !request || isEntityAllowed(user, 'invoice_approval', request.project_id)
}

// Marking an invoice paid and setting the manual Payment Status dropdown.
export function canManagePayment(user, request) {
  if (!userHasRole(user, 'payment')) return false
  return !request || isEntityAllowed(user, 'payment', request.project_id)
}

export function isApprovedOrLater(status) {
  return ['approved', 'issued', 'closed'].includes(status)
}

// A submitted request can already be previewed as a full PO -- markup, tax,
// and grand total included -- so an approver can see exactly what they'd be
// signing off on before approving it. Printing/emailing it to the vendor
// still waits for isApprovedOrLater, since there's no real PO number yet.
export function canPreviewPo(status) {
  return status === 'submitted' || isApprovedOrLater(status)
}

// Named person(s) who actually hold a given role — since roles are strictly
// additive now (admin included), there's no fallback: if nobody has ticked
// the role, nobody can act on it yet.
export function usersWithRole(users, role) {
  return (users || []).filter((u) => u.active && u.roles?.includes(role)).map((u) => userDisplayName(u))
}

// Describes what has to happen next for a purchase request, and names
// whoever's responsible for it, for the Purchase Orders summary list.
export function nextStepInfo(request, users) {
  switch (request.status) {
    case 'draft':
      return { step: 'Submit', who: findUserName(users, request.requested_by) }
    case 'submitted': {
      const names = usersWithRole(users, 'purchase_rec_approval')
      return {
        step: request.on_hold ? 'On Hold' : 'Approval',
        who: names.length ? names.join(', ') : '—',
      }
    }
    case 'approved': {
      const names = usersWithRole(users, 'po_issue')
      return { step: 'Issue PO', who: names.length ? names.join(', ') : '—' }
    }
    case 'issued': {
      const workDone = isWorkFullyDone(request)
      const paymentStatus = computePaymentStatus(request)
      if (workDone && paymentStatus === 'paid') {
        return { step: 'Close PO', who: findUserName(users, request.requested_by) }
      }
      if (!workDone) {
        return { step: 'Receive/Complete', who: findUserName(users, request.requested_by) }
      }
      return { step: 'Invoicing', who: usersWithRole(users, 'invoice_matching').join(', ') || '—' }
    }
    case 'closed':
      return { step: 'Done', who: null }
    case 'rejected':
      return { step: 'Revise or drop', who: findUserName(users, request.requested_by) }
    case 'voided':
      return { step: 'Voided', who: null }
    default:
      return { step: '—', who: null }
  }
}

export function lineTotal(line) {
  const qty = Number(line.quantity) || 0
  const cost = Number(line.unit_cost) || 0
  return qty * cost
}

// The company's mailing address as it appears on every printed PO, top-right
// "Bill To" block and footer, regardless of project — fixed, never
// per-project or database-driven.
export const COMPANY_ADDRESS_BLOCK = [
  'c/o Great Circle Solar Management Corp',
  '#1210-330 Bay St',
  'Toronto, ON M5H 2S6',
  'O: 416.366.4227',
]

// The email address vendors send invoices to. It prints on every PO (screen,
// print and the emailed PDF), both for invoices and for all other correspondence.
// If it is ever emptied, the invoice line is left off rather than printing a blank.
export const PO_INVOICE_EMAIL = 'ap@greatcirclesolar.com'

// The numbered instructions at the foot of every PO, on screen/print and in
// the emailed PDF alike -- one list so the two can't drift apart.
export const PO_INSTRUCTIONS = [
  ...(PO_INVOICE_EMAIL ? [`Please send the invoice to: ${PO_INVOICE_EMAIL}`] : []),
  'Enter this note in accordance with the prices, terms, delivery method, and specifications listed above.',
  'Notify GCS immediately if PO number or work order is not specified.',
  'Reference the PO number on the invoice.',
  ...(PO_INVOICE_EMAIL ? [`Send all correspondence to: ${PO_INVOICE_EMAIL}`] : []),
]

// Single source of truth for the PO cost breakdown, shared by the printed PO
// layout and the vendor email body so the two can never disagree. Order of
// operations mirrors the printed template exactly:
//   Subtotal -> Credit -> Shipping/Handling -> Vendor Mark-Up (on parts only)
//   -> Sales Tax (on Subtotal + Shipping + Mark-Up - Credit) -> Grand Total
export function computePoTotals(request) {
  const lines = request?.purchase_request_lines || []
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0)
  const partSubtotal = lines
    .filter((l) => l.line_type === 'part')
    .reduce((sum, l) => sum + lineTotal(l), 0)

  // Markup and shipping/handling only apply when the PO has part lines (the
  // markup itself only ever applies to those lines) -- a services-only PO never
  // carries either, even if a stale value is still sitting on the row.
  const hasParts = linesHaveParts(lines)
  const credit = Number(request?.credit) || 0
  const shipping = hasParts ? Number(request?.shipping_handling) || 0 : 0
  const markupRate = hasParts ? Number(request?.markup_rate) || 0 : 0
  const taxRate = Number(request?.tax_rate) || 0

  const markupAmount = partSubtotal * (markupRate / 100)
  const taxableBase = subtotal + shipping + markupAmount - credit
  const taxAmount = taxableBase * (taxRate / 100)
  const grandTotal = subtotal - credit + shipping + markupAmount + taxAmount

  return { subtotal, partSubtotal, credit, shipping, markupRate, markupAmount, taxRate, taxAmount, grandTotal }
}

// Builds a mailto: link addressed to the vendor for a purchase request that
// has moved past approval, so a purchaser can hand it to their own email
// client to send. Returns null when the vendor has no email on file.
export function buildPoMailto(request) {
  const vendorEmail = request?.vendors?.email
  if (!vendorEmail) return null

  const poLabel = request.po_number || `#${request.id}`
  const subject = `Purchase Order ${poLabel}`

  const lineLines = (request.purchase_request_lines || []).map((l) => {
    const label =
      l.line_type === 'part'
        ? `${l.parts?.gcs_id ?? l.part_gcs_id} — ${l.parts?.gcs_part_id || ''} — ${l.parts?.description || ''}`
        : l.description || 'Service'
    const cost = l.unit_cost !== null && l.unit_cost !== undefined ? ` @ $${l.unit_cost}` : ''
    return `  - ${label} (Qty ${l.quantity}${cost})`
  })

  const totals = computePoTotals(request)
  const currency = request.currency || 'CAD'

  const bodyLines = [
    `Purchase Order ${poLabel}`,
    `Entity: ${request.projects?.name || '—'}`,
    ...(request?.vendors?.address ? [`Ship to / Address: ${request.vendors.address}`] : []),
    '',
    'Line Items:',
    ...(lineLines.length ? lineLines : ['  (none)']),
    '',
    `Subtotal: $${totals.subtotal.toFixed(2)}`,
    `Credit: -$${totals.credit.toFixed(2)}`,
    `Shipping/Handling: $${totals.shipping.toFixed(2)}`,
    `Vendor Mark-Up (${totals.markupRate.toFixed(1)}%): $${totals.markupAmount.toFixed(2)}`,
    `Sales Taxes (${totals.taxRate.toFixed(1)}%): $${totals.taxAmount.toFixed(2)}`,
    `Grand Total: $${totals.grandTotal.toFixed(2)}`,
    `Currency: ${currency}`,
  ]
  if (request.notes) {
    bodyLines.push('', `Notes: ${request.notes}`)
  }

  const body = bodyLines.join('\n')
  return `mailto:${vendorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// Narrows the parts list to those whose GCS P/N, Part ID, Manufacturer P/N or
// Description contain the search text — used to pick a part on a purchase
// request line.
export function filterPartsForSearch(parts, search) {
  const q = (search || '').trim().toLowerCase()
  if (!q) return parts
  return parts.filter((p) =>
    [String(p.gcs_id ?? ''), p.gcs_part_id, p.manufacturer_part_number, p.description]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q))
  )
}
