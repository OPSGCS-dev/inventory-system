// Finding the POs that belong together: ones that share a vendor invoice, ones linked by hand, and a PO's
// replacement when it was voided and regenerated at a higher amount. Pure functions over plain data.

// Invoice numbers are compared ignoring case and punctuation, like the database's duplicate check.
export const normalizeInvoiceNumber = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// The POs related to `request`: those that share one of its invoice numbers (same vendor), those linked to it
// by hand, and the PO it was regenerated into / from (`links` rows { id, request_a, request_b, reason }). Returns [{ request, reasons: [text], linkId }].
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

  // Same vendor, and either the same invoice number or the same invoice file (an invoice with no number read or
  // typed is still recognised when the same PDF went on both POs).
  const mine = new Map()
  const myFiles = new Map()
  for (const inv of request.invoices || []) {
    const n = normalizeInvoiceNumber(inv.invoice_number)
    if (n) mine.set(n, inv.invoice_number)
    const f = String(inv.file_name || '').trim().toLowerCase()
    if (f) myFiles.set(f, inv.file_name)
  }
  if (mine.size > 0 || myFiles.size > 0) {
    for (const other of allRequests || []) {
      if (other.id === request.id || other.vendor_id !== request.vendor_id) continue
      for (const inv of other.invoices || []) {
        const n = normalizeInvoiceNumber(inv.invoice_number)
        const f = String(inv.file_name || '').trim().toLowerCase()
        if (n && mine.has(n)) add(other, `shares invoice #${mine.get(n)}`)
        else if (f && myFiles.has(f)) add(other, `shares the invoice file ${myFiles.get(f)}`)
      }
    }
  }
  for (const link of links) {
    const isOld = link.request_a === request.id // for a 'regenerated' link, request_a is the voided PO
    if (!isOld && link.request_b !== request.id) continue
    const other = byId.get(isOld ? link.request_b : link.request_a)
    if (link.reason === 'regenerated') {
      add(other, isOld ? 'voided and regenerated as this PO' : 'this PO was regenerated from it', link.id)
    } else {
      add(other, 'linked by hand', link.id)
    }
  }
  return [...out.values()]
}

// Find a PO from what was typed: "PO-11-26-002", "11-26-002" or just the number part, case ignored.
export function findRequestByNumber(allRequests, text) {
  const t = String(text || '').trim().toLowerCase().replace(/^po[-\s]*/, '')
  if (!t) return null
  return (allRequests || []).find((r) => (r.po_number || '').toLowerCase().replace(/^po[-\s]*/, '') === t) || null
}
