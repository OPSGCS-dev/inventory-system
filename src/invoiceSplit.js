// Splitting one vendor invoice across POs, and finding POs that belong together.
//
// A vendor sometimes invoices for more than the PO (shipping added afterwards), and a second PO is raised
// for the difference. Each PO gets its own invoice row with just its share; these functions work out the
// share from the line items read off the PDF, and find the POs that share an invoice. Pure functions over
// plain data, so they can be tried from Node.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// The things on an invoice a PO can take: each line item, the markup if there is one, and the shipping charge
// as an item of its own. `extracted` is what scrape/extractDocument.js read. With no line items but a
// subtotal, "everything except shipping" stands in for them, so shipping can still be split off.
export function invoiceItemRows(extracted) {
  if (!extracted) return []
  const rows = []
  const items = extracted.lines?.items || []
  items.forEach((it, i) => {
    rows.push({
      key: `item-${i}`,
      kind: 'item',
      label: it.description || it.partNumber || `Item ${i + 1}`,
      partNumber: it.partNumber || '',
      quantity: it.quantity ?? null,
      amount: round2(it.amount),
    })
  })
  if (extracted.markup && extracted.markup.amount > 0) {
    rows.push({ key: 'markup', kind: 'markup', label: 'Markup', partNumber: '', quantity: null, amount: round2(extracted.markup.amount) })
  }
  const shipping = Number(extracted.shipping) || 0
  if (items.length === 0 && extracted.subtotal != null) {
    const goods = round2(extracted.subtotal - shipping)
    if (goods > 0) {
      rows.unshift({ key: 'goods', kind: 'item', label: 'Goods / services (everything except shipping)', partNumber: '', quantity: null, amount: goods })
    }
  }
  if (shipping > 0) {
    rows.push({ key: 'shipping', kind: 'shipping', label: 'Shipping / handling', partNumber: '', quantity: null, amount: round2(shipping) })
  }
  return rows
}

// The tax rate (percent) to put on a share of the invoice: the stated rate, or worked out from the tax amount.
export function invoiceTaxRate(extracted, rows) {
  const tax = extracted?.tax
  if (!tax || !(tax.amount > 0)) return 0
  if (tax.rate != null && tax.rate > 0) return tax.rate
  const base = extracted.subtotal ?? rows.reduce((s, r) => s + r.amount, 0)
  return base > 0 ? round2((tax.amount / base) * 100) : 0
}

// What a PO takes when only the ticked rows are for it: their sum plus the tax on them. Ticking everything is the
// whole invoice, so the document's own total is used exactly as printed (rounding, fees that weren't read).
export function allocateInvoice(extracted, rows, selectedKeys) {
  const chosen = rows.filter((r) => selectedKeys.includes(r.key))
  const partial = chosen.length !== rows.length
  const subtotal = round2(chosen.reduce((s, r) => s + r.amount, 0))
  const taxRate = invoiceTaxRate(extracted, rows)
  const tax = round2((subtotal * taxRate) / 100)
  const computed = round2(subtotal + tax)
  const documentTotal = extracted?.amount?.value ?? null
  return {
    partial,
    subtotal,
    taxRate,
    tax,
    amount: partial || documentTotal === null ? computed : documentTotal,
    documentTotal,
    covers: partial ? chosen.map((r) => r.label).join('; ').slice(0, 300) : '',
  }
}

// Invoice numbers are compared ignoring case and punctuation, like the database's duplicate check.
export const normalizeInvoiceNumber = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// The POs related to `request`: those that share one of its invoice numbers (same vendor), and those linked to it
// by hand (`links` rows { id, request_a, request_b, ... }). Returns [{ request, reasons: [text], linkId }].
export function relatedRequests(request, allRequests, links = []) {
  if (!request) return []
  const byId = new Map((allRequests || []).map((r) => [r.id, r]))
  const out = new Map()
  const add = (other, reason, linkId = null) => {
    if (!other || other.id === request.id) return
    const entry = out.get(other.id) || { request: other, reasons: [], linkId: null }
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason)
    if (linkId) entry.linkId = linkId
    out.set(other.id, entry)
  }

  const mine = new Map()
  for (const inv of request.invoices || []) {
    const n = normalizeInvoiceNumber(inv.invoice_number)
    if (n) mine.set(n, inv.invoice_number)
  }
  if (mine.size > 0) {
    for (const other of allRequests || []) {
      if (other.id === request.id || other.vendor_id !== request.vendor_id) continue
      for (const inv of other.invoices || []) {
        const n = normalizeInvoiceNumber(inv.invoice_number)
        if (mine.has(n)) add(other, `shares invoice #${mine.get(n)}`)
      }
    }
  }
  for (const link of links) {
    if (link.request_a === request.id) add(byId.get(link.request_b), 'linked by hand', link.id)
    else if (link.request_b === request.id) add(byId.get(link.request_a), 'linked by hand', link.id)
  }
  return [...out.values()]
}

// Find a PO from what was typed: "PO-11-26-002", "11-26-002" or just the number part, case ignored.
export function findRequestByNumber(allRequests, text) {
  const t = String(text || '').trim().toLowerCase().replace(/^po[-\s]*/, '')
  if (!t) return null
  return (allRequests || []).find((r) => (r.po_number || '').toLowerCase().replace(/^po[-\s]*/, '') === t) || null
}
