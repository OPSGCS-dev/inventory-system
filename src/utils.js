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

export const PO_STATUS_ORDER = ['draft', 'submitted', 'approved', 'issued', 'closed']

export const PO_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Requested',
  approved: 'Approved',
  issued: 'PO Issued',
  closed: 'Closed',
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
export const WORK_STATUS_OPTIONS_BY_CATEGORY = {
  purchase: ['not_ordered', 'ordered', 'partially_received', 'received'],
  service: ['not_started', 'partial', 'complete'],
}

export function workStatusOptionsForCategory(category) {
  const key = category === 'purchase' ? 'purchase' : 'service'
  return WORK_STATUS_OPTIONS_BY_CATEGORY[key].map((value) => ({
    value,
    label: WORK_STATUS_LABELS[value],
  }))
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

export function computeWorkStatus(request) {
  if (request?.work_status) return request.work_status
  return poCategory(request) === 'purchase' ? 'not_ordered' : 'not_started'
}

// The "fully done" end of whichever vocabulary applies -- 'complete' for a
// Service PO, 'received' for a Purchase PO. Everything that used to compare
// work_status straight against 'complete' (closing a PO, the progress
// stepper, "what's next") goes through this instead.
export function isWorkFullyDone(request) {
  const status = computeWorkStatus(request)
  return poCategory(request) === 'purchase' ? status === 'received' : status === 'complete'
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

// A purchase request is either entirely parts or entirely a service — never
// mixed — so its "type" is just whatever its lines are. Defaults to 'part'
// when there are no lines yet (a fresh draft).
export function poLineType(request) {
  const lines = request?.purchase_request_lines || []
  return lines.some((l) => l.line_type === 'service') ? 'service' : 'part'
}

// Used to block saving a draft that mixes part lines and service lines.
export function linesAreMixedType(lines) {
  const types = new Set((lines || []).map((l) => l.line_type))
  return types.has('part') && types.has('service')
}

// A PO's category is independent of its line type (part vs service): it
// decides whether markup/shipping apply and whether a spending cap is
// tracked. Defaults to 'purchase' for anything created before this existed.
export const PO_CATEGORY_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'service', label: 'Service' },
]

export const PO_CATEGORY_LABELS = {
  purchase: 'Purchase',
  service: 'Service',
}

export function poCategory(request) {
  return request?.po_category || 'purchase'
}

// A PO's category dictates its line type outright -- Purchase POs are parts
// only, Service POs (Not to Exceed or not) are services only -- so there's
// no separate per-line type picker for the requester to get wrong.
export function categoryLineType(category) {
  return category === 'purchase' ? 'part' : 'service'
}

// Not to Exceed is a checkbox on a Service PO, not its own category -- it
// only ever means anything once category is 'service', but this guards it
// directly in case a stale row still has the flag set from before a
// category change.
export function isNotToExceed(request) {
  return poCategory(request) === 'service' && Boolean(request?.not_to_exceed)
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
export const ENTITY_SCOPED_ROLES = ['purchase_rec_approval', 'po_issue']

// inventory_mode is how a draft part line relates to inventory -- 'inventory'
// (pick a master-list part, on the entity's list or not), 'new' (a part that
// isn't in the master list yet) or 'not_tracked' (a consumable that shouldn't
// be counted). The last three fields only matter for 'new' / 'not_tracked'.
export const blankPurchaseRequestLine = (lineType = 'part') => ({
  _tempId: crypto.randomUUID(),
  line_type: lineType,
  part_gcs_id: null,
  description: '',
  quantity: '1',
  unit_cost: '',
  partSearch: '',
  inventory_mode: 'inventory',
  vendor_part_number: '',
  new_part_name: '',
  not_tracked_reason: '',
})

// Has anything been entered on a draft part line at all? (The untouched
// default line is not "content" -- it just isn't saved.)
export function partLineHasContent(line) {
  return Boolean(
    line.part_gcs_id ||
      (line.description || '').trim() ||
      (line.vendor_part_number || '').trim() ||
      (line.new_part_name || '').trim() ||
      (line.not_tracked_reason || '').trim() ||
      Number(line.unit_cost) > 0
  )
}

// Has the person said how this part line relates to inventory? Every part
// line with content has to answer that -- it can't just be left unlinked,
// because that is how a part that needs counting gets skipped.
export function partLineIsComplete(line) {
  if (line.inventory_mode === 'new') {
    return Boolean((line.vendor_part_number || '').trim() && (line.new_part_name || '').trim())
  }
  if (line.inventory_mode === 'not_tracked') return Boolean((line.not_tracked_reason || '').trim())
  return Boolean(line.part_gcs_id)
}

// One line of plain English about what a saved part line will do to (or has
// done to) inventory, for the approver and the PO detail view. Null for an
// ordinary part already on the entity's list, and for service lines.
export function describeLineInventory(line, entityName, approved) {
  const where = entityName ? `${entityName}'s inventory` : "the entity's inventory"
  if (line.inventory_action === 'add_existing') {
    return approved ? `Added to ${where}` : `Will be added to ${where} on approval`
  }
  if (line.inventory_action === 'add_new') {
    const what = [line.vendor_part_number, line.new_part_name].filter(Boolean).join(' — ')
    return approved ? `New part created and added to ${where}: ${what}` : `New part "${what}" — will be created and added to ${where} on approval`
  }
  if (line.inventory_action === 'not_tracked') {
    return `Not tracked in inventory — ${line.not_tracked_reason || 'no reason given'}`
  }
  return null
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

export function canCreatePurchaseRequests(user) {
  return userHasRole(user, 'purchase_req')
}

// A draft stays editable by anyone who can create requests (matching how
// "Edit Draft" always worked). Once submitted, only the original requester
// (or an admin) can still adjust it -- most useful while an approver has put
// it on hold and is waiting on a fix, since otherwise a hold would just be a
// dead end with no way to act on the reason for it.
export function canEditPurchaseRequest(user, request) {
  if (!request) return false
  if (request.status === 'draft') return canCreatePurchaseRequests(user)
  if (request.status === 'submitted') return isAdmin(user) || user?.id === request.requested_by
  return false
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
  if (isVendorUser(user) && poLineType(request) === 'service' && user?.vendor_id === request?.vendor_id) {
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
export function canMatchInvoices(user) {
  return userHasRole(user, 'invoice_matching')
}

// Approving a matched invoice/receipt pair -- company-wide, not scoped to
// whoever happened to approve that PO's original requisition. Only matters
// once accounting has actually paired an invoice with a receipt (an
// unmatched invoice has nothing to approve yet).
export function canApproveInvoice(user, invoice) {
  if (!invoice?.matched_receipt_id) return false
  return userHasRole(user, 'invoice_approval')
}

// Marking an invoice paid and setting the manual Payment Status dropdown.
export function canManagePayment(user) {
  return userHasRole(user, 'payment')
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

  // Markup and shipping/handling only apply to Purchase-category POs --
  // Service and Not to Exceed POs never carry either, even if a stale value
  // is still sitting on the row from before the category was changed.
  const isPurchaseCategory = poCategory(request) === 'purchase'
  const credit = Number(request?.credit) || 0
  const shipping = isPurchaseCategory ? Number(request?.shipping_handling) || 0 : 0
  const markupRate = isPurchaseCategory ? Number(request?.markup_rate) || 0 : 0
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
