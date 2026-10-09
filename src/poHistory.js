// Turns rows of the PO audit trail (po_history, written by database triggers -- see
// supabase/add_po_history.sql) into text a person can read: what happened, and which fields
// changed from what to what. Pure functions, no React or network, so they can be run from Node.
import { findUserName, formatMoney, paymentStatusLabel, poStatusLabel, workStatusLabel } from './utils.js'

export const PO_HISTORY_CATEGORIES = {
  request: 'Request',
  approval: 'Approvals',
  issue: 'Issuing',
  receiving: 'Receiving / work',
  invoicing: 'Invoices & receipts',
  payment: 'Payment',
  closeout: 'Closing / voiding',
  vendor: 'Vendors',
  documents: 'Documents',
  legacy: 'Old activity log',
}

// event code -> label, in the order they appear in the Event filter.
export const PO_HISTORY_EVENTS = {
  po_created: 'Request created',
  edited: 'Request edited',
  submitted: 'Submitted for approval',
  returned_to_draft: 'Returned to draft',
  line_added: 'Line added',
  line_changed: 'Line changed',
  line_removed: 'Line removed',
  approved: 'Request approved',
  rejected: 'Request rejected',
  held: 'Put on hold',
  resumed: 'Resumed from hold',
  issued: 'PO issued',
  work_status_changed: 'Parts / service status changed',
  invoice_added: 'Invoice added',
  receipt_added: 'Receipt added',
  invoice_matched: 'Invoice matched to receipt',
  invoice_unmatched: 'Invoice unmatched',
  prepaid_changed: 'Pre-paid changed',
  invoice_reviewed: 'Invoice approved by requisitioner',
  review_withdrawn: 'Requisitioner approval withdrawn',
  invoice_returned: 'Invoice sent back',
  invoice_resubmitted: 'Invoice resubmitted',
  payment_batch_created: 'Payment batch created',
  invoice_approved_for_payment: 'Invoice approved for payment',
  payment_approval_withdrawn: 'Payment approval withdrawn',
  invoice_paid: 'Invoice marked paid',
  payment_cleared: 'Payment cleared',
  payment_status_changed: 'Payment status changed',
  invoice_edited: 'Invoice edited',
  invoice_deleted: 'Invoice deleted',
  receipt_edited: 'Receipt edited',
  receipt_deleted: 'Receipt deleted',
  payment_batch_removed: 'Payment batch removed',
  payment_batch_edited: 'Payment batch edited',
  closed: 'PO closed',
  voided: 'PO voided',
  status_changed: 'Status changed',
  po_deleted: 'Draft deleted',
  vendor_requested: 'Vendor requested',
  vendor_added: 'Vendor added',
  vendor_approved: 'Vendor approved',
  vendor_rejected: 'Vendor rejected',
  vendor_status_changed: 'Vendor status changed',
  vendor_edited: 'Vendor edited',
  vendor_deleted: 'Vendor deleted',
  po_pdf_downloaded: 'PO PDF downloaded',
  po_email_drafted: 'Vendor email drafted',
  activity_note: 'Note from the old activity log',
}

export const eventLabel = (code) => PO_HISTORY_EVENTS[code] || code

const FIELD_LABELS = {
  // the PO
  status: 'Status',
  description: 'Description',
  po_number: 'PO #',
  project_id: 'Entity',
  vendor_id: 'Vendor',
  sub_project_id: 'Project / site',
  notes: 'Notes',
  vendor_quote_number: 'Vendor quote #',
  quote_file_url: 'Quote file',
  quote_file_name: 'Quote file name',
  markup_rate: 'Markup',
  tax_rate: 'Sales tax',
  shipping_handling: 'Shipping / handling',
  credit: 'Credit',
  not_to_exceed: 'Not to exceed',
  spending_cap: 'Spending cap',
  currency: 'Currency',
  budget_category_id: 'Budget category',
  budget_subcategory_id: 'Budget sub-category',
  chargeable_expense: 'Chargeable expense',
  invoice_email: 'Invoice email',
  prepaid: 'Pre-paid',
  on_hold: 'On hold',
  hold_reason: 'Hold reason',
  parts_status: 'Parts status',
  service_status: 'Service status',
  work_status: 'Work status',
  payment_status: 'Payment status',
  void_reason: 'Void reason',
  rejection_reason: 'Rejection reason',
  po_category: 'PO category',
  ticket_system_ticket_id: 'Ticket',
  ticket_system_ticket_number: 'Ticket number',
  ticket_system_ticket_code: 'Ticket code',
  // lines
  line_type: 'Type',
  quantity: 'Quantity',
  unit_cost: 'Unit cost',
  part_gcs_id: 'Part',
  inventory_action: 'Inventory action',
  vendor_part_number: 'Vendor part #',
  new_part_name: 'New part name',
  // invoices and receipts
  invoice_number: 'Invoice #',
  amount: 'Amount',
  file_url: 'File',
  file_name: 'File name',
  matched_receipt_id: 'Matched receipt',
  reviewed: 'Reviewed by requisitioner',
  approved: 'Approved for payment',
  paid: 'Paid',
  paid_date: 'Date paid',
  payment_reference: 'Payment reference',
  payment_batch_id: 'Payment batch',
  return_reason: 'Reason sent back',
  returned_stage: 'Sent back from',
  // vendors
  name: 'Name',
  contact_name: 'Contact',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  approval_status: 'Approval status',
  logon_enabled: 'Vendor logon',
}

const prettify = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function fieldLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  if (key === 'requested_by') return 'Requested by'
  if (key.endsWith('_by')) return prettify(key.slice(0, -3)) + ' by'
  if (key.endsWith('_at')) return prettify(key.slice(0, -3)) + ' at'
  return prettify(key)
}

const MONEY_FIELDS = new Set(['amount', 'unit_cost', 'shipping_handling', 'credit', 'spending_cap'])
const PERCENT_FIELDS = new Set(['markup_rate', 'tax_rate'])
const FILE_FIELDS = new Set(['file_url', 'quote_file_url', 'receipt_file_url'])
const STATUS_FIELDS = new Set(['status'])
const WORK_FIELDS = new Set(['parts_status', 'service_status', 'work_status'])

// One stored value as text. `ctx` = { users, projects, vendors } so ids can be shown as names.
export function formatValue(key, value, ctx = {}) {
  if (value === null || value === undefined || value === '') return '(blank)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'project_id') return ctx.projects?.find((p) => p.id === value)?.name || `entity #${value}`
  if (key === 'vendor_id') return ctx.vendors?.find((v) => v.id === value)?.name || `vendor #${value}`
  if (key === 'payment_batch_id') return `batch #${value}`
  if (key === 'matched_receipt_id') return `receipt #${value}`
  if (key.endsWith('_by') && typeof value === 'number') return findUserName(ctx.users, value) || `user #${value}`
  if (key.endsWith('_at')) return Number.isNaN(Date.parse(value)) ? String(value) : new Date(value).toLocaleString()
  if (key === 'paid_date') {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString()
  }
  if (FILE_FIELDS.has(key)) return 'a file'
  if (MONEY_FIELDS.has(key)) return formatMoney(value)
  if (PERCENT_FIELDS.has(key)) return `${Number(value)}%`
  if (STATUS_FIELDS.has(key)) return poStatusLabel(value)
  if (WORK_FIELDS.has(key)) return workStatusLabel(value)
  if (key === 'payment_status') return paymentStatusLabel(value)
  return String(value)
}

// Every field that changed, as { field, label, from, to }. A new row has no `from`, a deleted
// one no `to`. Internal keys (those starting with "_") are left out; see heldLines.
export function changeLines(row, ctx = {}) {
  return Object.entries(row.changes || {})
    .filter(([k, c]) => !k.startsWith('_') && c && typeof c === 'object')
    .map(([field, c]) => ({
      field,
      label: fieldLabel(field),
      from: 'old' in c ? formatValue(field, c.old, ctx) : null,
      to: 'new' in c ? formatValue(field, c.new, ctx) : null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// What a deleted draft held (recorded with its deletion).
export function heldLines(row) {
  const held = row.changes?._held
  if (!held) return []
  const out = []
  const lines = held.lines || []
  if (lines.length) {
    out.push(`${lines.length} line${lines.length === 1 ? '' : 's'}: ${lines.map((l) => `${l.description || l.type} × ${l.quantity}`).join('; ')}`)
  }
  const invoices = held.invoices || []
  if (invoices.length) out.push(`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}: ${invoices.map((i) => `${i.invoice_number || '(no #)'} ${formatMoney(i.amount)}`).join('; ')}`)
  if (held.receipts) out.push(`${held.receipts} receipt${held.receipts === 1 ? '' : 's'}`)
  return out
}

const newOf = (row, k) => row.changes?.[k]?.new
const oldOf = (row, k) => row.changes?.[k]?.old
const arrow = (row, k, ctx) => (row.changes?.[k] ? `${formatValue(k, oldOf(row, k), ctx)} → ${formatValue(k, newOf(row, k), ctx)}` : '')

// "Unit cost: $100.00 → $120.00" for each changed field, a few at most.
function changedList(row, ctx) {
  const lines = changeLines(row, ctx)
  const shown = lines.slice(0, 3).map((c) => (c.from !== null && c.to !== null ? `${c.label}: ${c.from} → ${c.to}` : `${c.label}: ${c.to ?? c.from}`))
  return lines.length > 3 ? [...shown, `+${lines.length - 3} more`] : shown
}

// Just the names of the fields that changed: "Description, Notes".
function changedNames(row) {
  const names = changeLines(row).map((c) => c.label)
  if (names.length === 0) return []
  return [names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4} more` : names.join(', ')]
}

// The one-line version of an event: its name plus the facts that matter for it.
export function summarize(row, ctx = {}) {
  const label = eventLabel(row.event)
  const inv = row.invoice_number ? `Invoice #${row.invoice_number}` : 'Invoice'
  const amt = (() => {
    const a = newOf(row, 'amount') ?? oldOf(row, 'amount')
    return a === undefined ? '' : ` (${formatValue('amount', a, ctx)})`
  })()
  const bits = []
  switch (row.event) {
    case 'issued':
      if (newOf(row, 'po_number')) bits.push(`as ${newOf(row, 'po_number')}`)
      break
    case 'rejected':
      if (newOf(row, 'rejection_reason')) bits.push(`reason: ${newOf(row, 'rejection_reason')}`)
      break
    case 'voided':
      if (newOf(row, 'void_reason')) bits.push(`reason: ${newOf(row, 'void_reason')}`)
      break
    case 'held':
      if (newOf(row, 'hold_reason')) bits.push(`reason: ${newOf(row, 'hold_reason')}`)
      break
    case 'work_status_changed':
      for (const k of ['parts_status', 'service_status', 'work_status']) {
        if (row.changes?.[k]) bits.push(`${fieldLabel(k)}: ${arrow(row, k, ctx)}`)
      }
      break
    case 'payment_status_changed':
      bits.push(arrow(row, 'payment_status', ctx))
      break
    case 'prepaid_changed':
      bits.push(newOf(row, 'prepaid') ? 'marked pre-paid' : 'pre-paid cleared')
      break
    case 'line_added':
    case 'line_removed': {
      const q = newOf(row, 'quantity') ?? oldOf(row, 'quantity')
      const c = newOf(row, 'unit_cost') ?? oldOf(row, 'unit_cost')
      bits.push([row.note, q != null ? `× ${q}` : '', c != null ? `@ ${formatValue('unit_cost', c, ctx)}` : ''].filter(Boolean).join(' '))
      break
    }
    case 'line_changed':
      bits.push(row.note, ...changedList(row, ctx))
      break
    case 'edited':
      bits.push(...changedNames(row))
      break
    case 'invoice_added':
    case 'invoice_deleted':
    case 'invoice_edited':
    case 'invoice_matched':
    case 'invoice_unmatched':
    case 'invoice_reviewed':
    case 'review_withdrawn':
    case 'invoice_approved_for_payment':
    case 'payment_approval_withdrawn':
    case 'invoice_resubmitted':
      return `${label}: ${inv}${amt}`
    case 'invoice_returned':
      return `${label}: ${inv}${amt}${newOf(row, 'return_reason') ? ` — ${newOf(row, 'return_reason')}` : ''}`
    case 'invoice_paid': {
      const d = newOf(row, 'paid_date')
      const r = newOf(row, 'payment_reference')
      return `${label}: ${inv}${amt}${d ? ` on ${formatValue('paid_date', d, ctx)}` : ''}${r ? `, ref ${r}` : ''}`
    }
    case 'payment_cleared':
      return `${label}: ${inv}${amt}`
    case 'receipt_added':
    case 'receipt_deleted':
    case 'receipt_edited': {
      const f = row.note || newOf(row, 'file_name') || oldOf(row, 'file_name')
      if (f) bits.push(f)
      break
    }
    case 'payment_batch_created':
    case 'payment_batch_removed':
      if (row.note) bits.push(`"${row.note}" (#${row.record_id})`)
      break
    case 'po_deleted':
      bits.push(row.po_number || '')
      break
    case 'vendor_requested':
    case 'vendor_added':
    case 'vendor_approved':
    case 'vendor_rejected':
    case 'vendor_edited':
    case 'vendor_deleted':
    case 'vendor_status_changed':
      if (row.vendor_name) bits.push(row.vendor_name)
      if (row.event === 'vendor_rejected' && newOf(row, 'rejection_reason')) bits.push(`reason: ${newOf(row, 'rejection_reason')}`)
      break
    case 'po_pdf_downloaded':
    case 'po_email_drafted':
      if (row.note) bits.push(row.note)
      break
    case 'activity_note':
      return row.note || label
    default:
      break
  }
  const rest = bits.filter(Boolean).join(' — ')
  return rest ? `${label}: ${rest}` : label
}

// A PO label for a row: its number, or "Request #id" while it had none (a draft).
export const poLabelOf = (row) => row.po_number || (row.purchase_request_id ? `Request #${row.purchase_request_id}` : '')

// One CSV line for an export, including the chain position and hash so an auditor can check it.
export function historyCsvRow(row, ctx = {}) {
  return {
    'Seq': row.seq,
    'When': new Date(row.happened_at).toLocaleString(),
    'When (UTC)': row.happened_at,
    'Who': row.actor_name || 'System',
    'Category': PO_HISTORY_CATEGORIES[row.category] || row.category,
    'Event': eventLabel(row.event),
    'PO #': poLabelOf(row),
    'Entity': row.entity_name || '',
    'Vendor': row.vendor_name || '',
    'Invoice #': row.invoice_number || '',
    'Summary': summarize(row, ctx),
    'Changes': changeLines(row, ctx)
      .map((c) => (c.from !== null && c.to !== null ? `${c.label}: ${c.from} → ${c.to}` : `${c.label}: ${c.to ?? c.from}`))
      .join('; '),
    'Table': row.source_table,
    'Record id': row.record_id ?? '',
    'Hash': row.row_hash,
    'Previous hash': row.prev_hash,
  }
}
