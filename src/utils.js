export const WHERE_USED_SEED = ['SMA 500 CP', 'SMA 500 XP', 'SATCON 500', 'Substation', 'Array']

export const TICKETING_URL = 'https://ticket-system-gcs14.vercel.app'

export const emptyFilters = {
  gcs_id: '',
  gcs_part_id: '',
  manufacturer_part_number: '',
  manufacturer: '',
  spare_category: '',
  where_used: '',
  description: '',
}

export const blankDraftRow = () => ({
  _existing: false,
  _tempId: crypto.randomUUID(),
  gcs_part_id: '',
  manufacturer_part_number: '',
  manufacturer: '',
  spare_category: '',
  where_used: '',
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

export const PO_STATUS_ORDER = ['draft', 'submitted', 'approved', 'issued', 'received']

export const PO_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Requested',
  approved: 'Approved',
  issued: 'PO Issued',
  received: 'Complete/Received',
}

export function poStatusLabel(status) {
  return PO_STATUS_LABELS[status] || status
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

export const PO_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'purchase_req', label: 'Ticket/Purchase Req' },
  { value: 'approve', label: 'Approve' },
  { value: 'receive', label: 'Receive' },
  { value: 'accounting', label: 'Accounting' },
]

export const blankPurchaseRequestLine = (lineType = 'part') => ({
  _tempId: crypto.randomUUID(),
  line_type: lineType,
  part_gcs_id: null,
  description: '',
  quantity: '1',
  unit_cost: '',
  partSearch: '',
})

export function findUserName(users, id) {
  if (!id) return '—'
  return users.find((u) => u.id === id)?.name || '—'
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

// Can edit the Master List / Required Inventory / Inventory On Hand (saving
// still requires the separate shared inventory password).
export function canEditInventory(user) {
  return userHasRole(user, 'inventory')
}

export function canCreatePurchaseRequests(user) {
  return userHasRole(user, 'purchase_req')
}

// Mirrors the ticket system's own eligibility check (lib/inventoryAccess.ts
// there) -- admin, Ticket/Purchase Req, or vendor. Only used to decide
// whether to show the "Ticketing" link; the ticket system re-checks this
// itself on login regardless.
export function canAccessTicketing(user) {
  return isAdmin(user) || userHasRole(user, 'purchase_req') || isVendorUser(user)
}

export function canApproveRequests(user) {
  return userHasRole(user, 'approve')
}

// Issuing the PO number and emailing/printing it to the vendor is folded
// into the Approve role — there's no separate "purchaser" role in the new
// model.
export function canIssuePurchaseOrder(user) {
  return userHasRole(user, 'approve')
}

export function canReceive(user) {
  return userHasRole(user, 'receive')
}

// Whoever created the purchase request is the one who must confirm its
// receipt — not just anyone holding the general "receive" role. For a
// service PO, the vendor who did the work can also upload the service
// report themselves (a parts receipt/photo still stays internal-only, since
// the vendor isn't the one physically receiving the parts).
export function canConfirmReceipt(user, request) {
  if (user?.id && user.id === request?.requested_by) return true
  if (isVendorUser(user) && poLineType(request) === 'service' && user?.vendor_id === request?.vendor_id) {
    return true
  }
  return false
}

// Marking an invoice approved and marking it paid are both gated by this
// one role — accounting doesn't need any other purchasing permission to do
// either.
export function canManageInvoicing(user) {
  return userHasRole(user, 'accounting')
}

export function isApprovedOrLater(status) {
  return ['approved', 'issued', 'received'].includes(status)
}

// Named person(s) who actually hold a given role — since roles are strictly
// additive now (admin included), there's no fallback: if nobody has ticked
// the role, nobody can act on it yet.
export function usersWithRole(users, role) {
  return (users || []).filter((u) => u.active && u.roles?.includes(role)).map((u) => u.name)
}

// Describes what has to happen next for a purchase request, and names
// whoever's responsible for it, for the Purchase Orders summary list.
export function nextStepInfo(request, users) {
  switch (request.status) {
    case 'draft':
      return { step: 'Submit', who: findUserName(users, request.requested_by) }
    case 'submitted': {
      const names = usersWithRole(users, 'approve')
      return { step: 'Approval', who: names.length ? names.join(', ') : '—' }
    }
    case 'approved': {
      const names = usersWithRole(users, 'approve')
      return { step: 'Issue PO', who: names.length ? names.join(', ') : '—' }
    }
    case 'issued':
      return { step: 'Receive', who: findUserName(users, request.requested_by) }
    case 'received':
      return { step: 'Complete', who: null }
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

  const credit = Number(request?.credit) || 0
  const shipping = Number(request?.shipping_handling) || 0
  const markupRate = Number(request?.markup_rate) || 0
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

// Narrows the parts list to those whose GCS P/N, Part ID, or Description
// contain the search text — used to pick a part on a purchase request line.
export function filterPartsForSearch(parts, search) {
  const q = (search || '').trim().toLowerCase()
  if (!q) return parts
  return parts.filter((p) =>
    [String(p.gcs_id ?? ''), p.gcs_part_id, p.description]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q))
  )
}
