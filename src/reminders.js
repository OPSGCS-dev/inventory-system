// "Email a Reminder": works out everything that is waiting on one person in the purchasing / payment flow, and
// writes the reminder email that lists it. The person doing the reminding (the Purchaser, or an admin) picks who
// to send it to; the email draft is a .eml file, like the vendor email (see poEmail.js).
//
// The counts use the very same permission rules as the nav badges and the "My ..." lists (canApproveRequests,
// canApproveInvoice, ...), but for any user rather than the one logged in, so a reminder never lists something the
// person couldn't actually open. Held invoices are left out, as they are in the badges: they wait on a decision
// that was already made, not on work.
//
// Only the two approval jobs are reminded about: recs waiting for approval and invoices waiting for approval for
// payment. Issuing POs, reviewing or paying invoices and approving vendors are not part of a reminder.
//
// Pure functions over plain data (no DOM), so they can be tested from Node.
import {
  canApproveRequests,
  canApproveInvoice,
  isInvoiceHeld,
  computePoTotals,
  totalsByCurrencyText,
  userDisplayName,
} from './utils.js'

// `user` must carry entity_scopes (role -> entity ids), the same shape App.jsx gives the logged-in user.
export function pendingWorkFor(user, purchaseRequests) {
  const recs = []
  const approve = []
  for (const r of purchaseRequests || []) {
    if (r.status === 'submitted' && canApproveRequests(user, r)) recs.push(r)
    if (r.status !== 'issued' && r.status !== 'closed') continue
    for (const invoice of r.invoices || []) {
      if (isInvoiceHeld(invoice)) continue
      if (canApproveInvoice(user, invoice, r)) approve.push({ request: r, invoice })
    }
  }

  const poTotal = (list) => totalsByCurrencyText(list.map((r) => ({ amount: computePoTotals(r).grandTotal, currency: r.currency })))
  const invTotal = (list) => totalsByCurrencyText(list.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency })))

  const items = [
    { key: 'recs', count: recs.length, one: 'rec to approve', many: 'recs to approve', total: poTotal(recs), where: 'My Recs for Approval' },
    { key: 'approve', count: approve.length, one: 'invoice to approve for payment', many: 'invoices to approve for payment', total: invTotal(approve), where: 'My Invoices for Payment Approval' },
  ].filter((item) => item.count > 0)

  return { items, total: items.reduce((sum, item) => sum + item.count, 0) }
}

// One line of the reminder: "- 3 recs to approve (total $1,234.00 CAD) - Purchase Orders > My Recs for Approval".
export function reminderItemLine(item) {
  const what = `${item.count} ${item.count === 1 ? item.one : item.many}`
  return `- ${what}${item.total ? ` (total ${item.total})` : ''}: Purchase Orders > ${item.where}`
}

export function buildReminderSubject(work) {
  const n = work.total
  return `Reminder: ${n} ${n === 1 ? 'item is' : 'items are'} waiting for your action in the GCS inventory system`
}

export function buildReminderBody({ person, work, senderName, url }) {
  const first = userDisplayName(person).split(/\s+/)[0] || ''
  const lines = [
    first ? `Hi ${first},` : 'Hello,',
    '',
    'A quick reminder of what is waiting on you in the GCS inventory system:',
    '',
    ...work.items.map(reminderItemLine),
    '',
  ]
  if (url) lines.push(`Open the system: ${url}`, '')
  lines.push('Thank you,')
  if (senderName) lines.push(senderName)
  return lines.join('\n')
}
