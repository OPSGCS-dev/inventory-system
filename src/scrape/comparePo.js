// Compares what was read from a vendor's invoice (extractDocument.js) with the
// purchase order it's being added to, so accounting can see at a glance when a
// vendor has sent the wrong invoice, the wrong amount or the wrong parts.
//
// Everything here is a *warning*, never a block: the reading is pattern-based
// and can be wrong, so each finding says what it saw on both sides and where,
// and the person adding the invoice decides. Pure functions over plain data
// (no pdf.js, DOM or network), so they can be run from a Node script.
//
// A check is { key, label, status: 'ok' | 'warn' | 'info', po, invoice, note,
// poMarks, invMarks }. `status` 'info' means "couldn't tell / worth knowing",
// not a problem. The marks say what to look for on each document to highlight
// it: { money: 12.5 } or { text: 'PO-06-26-001' } (see locateMarks).

import { computePoTotals, computeInvoicedTotal, isNotToExceed, lineTotal, formatMoney } from '../utils.js'
import { buildRows } from './extractDocument.js'
import { matchVendor, matchEntity, guessLetterhead } from './matchers.js'

const cents = (n) => Math.round((Number(n) || 0) * 100)
const same = (a, b, tolCents = 2) => Math.abs(cents(a) - cents(b)) <= tolCents
const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const money = (n) => formatMoney(n)

const STOP = new Set(['the', 'and', 'for', 'with', 'per', 'each', 'item', 'part', 'qty'])
function wordSet(text) {
  const words = String(text || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  return new Set((words || []).filter((w) => w.length >= 3 && !STOP.has(w)))
}

function allText(pages) {
  return pages.flatMap((p) => p.items.map((i) => i.str)).join(' ')
}

// --- PO number ---------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SEP = '[\\s\\-_./]*'

// Finds the PO's own number (however the vendor spaces it) and any *other*
// number written in the same shape ("PO-06-26-001" -> anything like PO-nn-nn-nnn)
// in the invoice's text.
function findPoNumbers(text, poNumber) {
  const segments = String(poNumber || '').match(/[A-Za-z]+|\d+/g)
  if (!segments) return { own: null, others: [] }
  const ownRe = new RegExp(`(?<![A-Za-z0-9])${segments.map(escapeRe).join(SEP)}(?![A-Za-z0-9])`, 'i')
  const own = text.match(ownRe)
  let others = []
  if (segments.length >= 3 && /[A-Za-z]/.test(segments[0])) {
    const anyRe = new RegExp(
      `(?<![A-Za-z0-9])${segments.map((s) => (/\d/.test(s) ? '\\d+' : escapeRe(s))).join(SEP)}(?![A-Za-z0-9])`,
      'gi'
    )
    others = [...new Set((text.match(anyRe) || []).map((m) => m.trim()))].filter((m) => normKey(m) !== normKey(poNumber))
  }
  return { own: own ? own[0].trim() : null, others }
}

// --- the comparison -----------------------------------------------------

export function compareInvoiceToPo({ extracted, pages, request }) {
  const checks = []
  const add = (c) => checks.push({ poMarks: [], invMarks: [], note: '', ...c })
  const totals = computePoTotals(request)
  const currency = request.currency || 'CAD'
  const invTotal = extracted.amount ? extracted.amount.value : null
  const totalMatches = invTotal !== null && same(invTotal, totals.grandTotal)

  // Vendor: the name on the PO should be the name at the top of the invoice.
  const vendorName = request.vendors?.name
  if (vendorName) {
    const rec = [{ id: request.vendors.id ?? 'po', name: vendorName }]
    if (matchVendor(pages, rec) || matchEntity(pages, rec)) {
      add({ key: 'vendor', label: 'Vendor', status: 'ok', po: vendorName, invoice: 'Name found on the invoice', poMarks: [{ text: vendorName }], invMarks: [{ text: vendorName }] })
    } else {
      const letterhead = guessLetterhead(pages)
      add({
        key: 'vendor',
        label: 'Vendor',
        status: 'warn',
        po: vendorName,
        invoice: letterhead || "Couldn't read a vendor name",
        note: `"${vendorName}" isn't on the invoice — is it from a different vendor?`,
        poMarks: [{ text: vendorName }],
        invMarks: letterhead ? [{ text: letterhead }] : [],
      })
    }
  }

  // PO number: vendors usually print the PO they were sent.
  if (request.po_number) {
    const { own, others } = findPoNumbers(allText(pages), request.po_number)
    if (own) {
      add({ key: 'po_number', label: 'PO number', status: 'ok', po: request.po_number, invoice: own, poMarks: [{ text: request.po_number }], invMarks: [{ text: own }] })
    } else if (others.length > 0) {
      add({
        key: 'po_number',
        label: 'PO number',
        status: 'warn',
        po: request.po_number,
        invoice: others.join(', '),
        note: `The invoice refers to ${others.join(', ')}, not this PO.`,
        poMarks: [{ text: request.po_number }],
        invMarks: others.map((o) => ({ text: o })),
      })
    } else {
      add({ key: 'po_number', label: 'PO number', status: 'info', po: request.po_number, invoice: 'Not found', note: "The invoice doesn't mention this PO number (not every vendor prints it).", poMarks: [{ text: request.po_number }] })
    }
  }

  // Total: against the PO's grand total (or what's left of it after earlier
  // invoices), or -- on a Not to Exceed PO -- against the spending cap.
  const invoicedSoFar = computeInvoicedTotal(request)
  if (invTotal === null) {
    add({ key: 'total', label: 'Total', status: 'info', po: money(totals.grandTotal), invoice: 'Not found', note: "Couldn't find the invoice total." })
  } else {
    const cap = isNotToExceed(request) ? Number(request.spending_cap) || 0 : 0
    if (cap > 0) {
      const after = invoicedSoFar + invTotal
      const ok = cents(after) <= cents(cap)
      add({
        key: 'total',
        label: 'Total',
        status: ok ? 'ok' : 'warn',
        po: `Cap ${money(cap)} (invoiced so far ${money(invoicedSoFar)})`,
        invoice: money(invTotal),
        note: ok ? '' : `With this invoice the total billed would be ${money(after)}, ${money(after - cap)} over the cap.`,
        poMarks: [{ money: cap }],
        invMarks: [{ money: invTotal }],
      })
    } else {
      const remaining = totals.grandTotal - invoicedSoFar
      const ok = totalMatches || (invoicedSoFar > 0 && same(invTotal, remaining))
      const diff = invTotal - totals.grandTotal
      add({
        key: 'total',
        label: 'Total',
        status: ok ? 'ok' : 'warn',
        po: money(totals.grandTotal) + (invoicedSoFar > 0 ? ` (${money(remaining)} not yet invoiced)` : ''),
        invoice: money(invTotal),
        note: ok
          ? ''
          : `The invoice is ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the PO total${
              invoicedSoFar > 0 && !same(invTotal, remaining) ? ` and doesn't equal the ${money(remaining)} still to invoice` : ''
            }.`,
        poMarks: [{ money: totals.grandTotal }],
        invMarks: [{ money: invTotal }],
      })
    }
    const invCurrency = extracted.amount.currency
    if (invCurrency) {
      const ok = invCurrency.toUpperCase() === currency.toUpperCase()
      add({ key: 'currency', label: 'Currency', status: ok ? 'ok' : 'warn', po: currency, invoice: invCurrency, note: ok ? '' : 'The invoice is in a different currency than the PO.' })
    }
  }

  // Breakdown lines. A different subtotal/shipping/tax is usually just the
  // wrong total showing up again (or a different way of laying out the same
  // total), so it's a note rather than another warning to count.
  const detail = (ok) => (ok ? 'ok' : 'info')
  if (extracted.subtotal != null) {
    const candidates = [totals.subtotal, totals.subtotal - totals.credit, totals.subtotal + totals.markupAmount, totals.subtotal + totals.markupAmount - totals.credit]
    const ok = candidates.some((c) => same(extracted.subtotal, c))
    add({ key: 'subtotal', label: 'Subtotal', status: detail(ok), po: money(totals.subtotal), invoice: money(extracted.subtotal), note: ok ? '' : "Doesn't match the PO's subtotal.", poMarks: ok ? [] : [{ money: totals.subtotal }], invMarks: ok ? [] : [{ money: extracted.subtotal }] })
  }
  if (extracted.shipping != null) {
    const ok = same(extracted.shipping, totals.shipping)
    add({ key: 'shipping', label: 'Shipping', status: detail(ok), po: money(totals.shipping), invoice: money(extracted.shipping), note: ok ? '' : "Doesn't match the PO's shipping/handling.", poMarks: ok || totals.shipping === 0 ? [] : [{ money: totals.shipping }], invMarks: ok ? [] : [{ money: extracted.shipping }] })
  }
  if (extracted.tax) {
    const ok = same(extracted.tax.amount, totals.taxAmount)
    add({ key: 'tax', label: 'Tax', status: detail(ok), po: `${money(totals.taxAmount)} (${totals.taxRate}%)`, invoice: `${money(extracted.tax.amount)}${extracted.tax.rate != null ? ` (${extracted.tax.rate}%)` : ''}`, note: ok ? '' : "Doesn't match the PO's sales tax.", poMarks: ok || totals.taxAmount === 0 ? [] : [{ money: totals.taxAmount }], invMarks: ok ? [] : [{ money: extracted.tax.amount }] })
  }

  // Line items: pair each invoice line with the PO line it most likely is
  // (same part number, else enough words in common), then compare quantity and
  // price. Lines that can't be paired are listed, not judged.
  const invLines = extracted.lines?.items || []
  const poLines = request.purchase_request_lines || []
  if (invLines.length > 0 && poLines.length > 0) {
    const reliable = extracted.lines.reconciled
    const lineStatus = (s) => (!reliable && s === 'warn' ? 'info' : s)
    const hasParts = poLines.some((l) => l.line_type === 'part')
    const factor = hasParts ? 1 + totals.markupRate / 100 : 1

    const po = poLines.map((l, i) => ({
      l,
      i,
      keys: [l.vendor_part_number, l.parts?.manufacturer_part_number, l.parts?.gcs_part_id].map(normKey).filter((k) => k.length >= 4),
      words: wordSet([l.description, l.new_part_name, l.parts?.description, l.vendor_part_number].filter(Boolean).join(' ')),
      name: String(l.parts?.description || l.description || l.new_part_name || l.vendor_part_number || `Line ${i + 1}`).slice(0, 60),
    }))
    const inv = invLines.map((it, i) => ({
      it,
      i,
      key: normKey(it.partNumber),
      descKey: normKey(it.description),
      words: wordSet(`${it.partNumber} ${it.description}`),
    }))

    const pairs = []
    for (const p of po) {
      for (const v of inv) {
        let score = 0
        if (v.key.length >= 4 && p.keys.includes(v.key)) score = 100
        else if (p.keys.some((k) => v.descKey.includes(k))) score = 90
        else {
          let shared = 0
          for (const w of p.words) if (v.words.has(w)) shared++
          const denom = Math.min(p.words.size, v.words.size)
          if (shared >= 2 && denom > 0 && shared / denom >= 0.6) score = 50 + (40 * shared) / denom
        }
        if (score > 0) pairs.push({ p, v, score })
      }
    }
    pairs.sort((a, b) => b.score - a.score)
    const usedPo = new Set()
    const usedInv = new Set()
    const matched = []
    for (const m of pairs) {
      if (usedPo.has(m.p.i) || usedInv.has(m.v.i)) continue
      usedPo.add(m.p.i)
      usedInv.add(m.v.i)
      matched.push(m)
    }

    const rows = []
    let agreeing = 0
    for (const { p, v } of matched) {
      const qty = Number(p.l.quantity) || 0
      const unit = Number(p.l.unit_cost) || 0
      const factorFor = p.l.line_type === 'part' ? factor : 1
      const qtyOk = qty === v.it.quantity
      const priceOk =
        [v.it.unitPrice, v.it.billedUnitPrice].some((x) => same(unit, x) || same(unit * factorFor, x)) ||
        (qtyOk && same(lineTotal(p.l), v.it.amount))
      if (qtyOk && priceOk) {
        agreeing++
        continue
      }
      const nameMark = [p.l.vendor_part_number, p.l.parts?.manufacturer_part_number].find((k) => normKey(k).length >= 4)
      rows.push({
        key: `line-${p.i}`,
        label: `Line: ${p.name}`,
        status: lineStatus('warn'),
        po: `${qty} × ${money(unit)}${factorFor !== 1 ? ' (+ mark-up)' : ''}`,
        invoice: `${v.it.quantity} × ${money(v.it.billedUnitPrice ?? v.it.unitPrice)}`,
        note: [!qtyOk && 'Quantity differs.', !priceOk && 'Unit price differs.'].filter(Boolean).join(' '),
        poMarks: [...(!priceOk ? [{ money: unit }] : []), ...(nameMark ? [{ text: nameMark }] : [])],
        invMarks: [...(!priceOk ? [{ money: v.it.billedUnitPrice ?? v.it.unitPrice }] : []), ...(v.it.partNumber ? [{ text: v.it.partNumber }] : [])],
      })
    }
    for (const v of inv) {
      if (usedInv.has(v.i)) continue
      rows.push({
        key: `inv-line-${v.i}`,
        label: `Line: ${(v.it.description || v.it.partNumber || 'Unnamed').slice(0, 60)}`,
        status: lineStatus('warn'),
        po: 'Not on the PO',
        invoice: `${v.it.quantity} × ${money(v.it.billedUnitPrice ?? v.it.unitPrice)} = ${money(v.it.amount)}`,
        note: "On the invoice but couldn't be matched to a PO line.",
        invMarks: [{ money: v.it.amount }, ...(v.it.partNumber ? [{ text: v.it.partNumber }] : [])],
      })
    }
    for (const p of po) {
      if (usedPo.has(p.i)) continue
      rows.push({
        key: `po-line-${p.i}`,
        label: `Line: ${p.name}`,
        status: 'info',
        po: `${Number(p.l.quantity) || 0} × ${money(Number(p.l.unit_cost) || 0)}`,
        invoice: 'Not on the invoice',
        note: 'May be on another invoice (partial shipment, back-order).',
        poMarks: [{ money: lineTotal(p.l) }],
      })
    }

    // The summary row itself is never a warning: the lines below it are.
    add({
      key: 'lines',
      label: 'Line items',
      status: rows.length > 0 ? 'info' : 'ok',
      po: `${poLines.length} line${poLines.length === 1 ? '' : 's'}`,
      invoice: `${invLines.length} line${invLines.length === 1 ? '' : 's'}`,
      note:
        (reliable ? '' : "The invoice's lines didn't add up to its own totals, so these are hints only. ") +
        `${agreeing} of ${poLines.length} PO line${poLines.length === 1 ? '' : 's'} found on the invoice with the same quantity and price.`,
    })
    rows.forEach(add)
  }

  return { checks, warnCount: checks.filter((c) => c.status === 'warn').length }
}

// --- where things are on the page --------------------------------------

const MONEY_IN_TEXT = /-?\$?\s*\d[\d,]*\.\d{2}/g

// Boxes (as fractions of the page, so they scale with the picture) around
// the text on `pages` that matches any of `marks`. A few per mark at most --
// a common figure like "12.50" shouldn't light up the whole page.
export function locateMarks(pages, marks) {
  const boxes = []
  const perMark = new Map()
  pages.forEach((page, pageIdx) => {
    const W = page.width || 612
    const H = page.height || 792
    for (const row of buildRows(page.items)) {
      for (const cell of row.cells) {
        marks.forEach((mark, mi) => {
          if ((perMark.get(mi) || 0) >= 3) return
          let hit = false
          if (mark.money != null) {
            const target = cents(mark.money)
            hit = (cell.text.match(MONEY_IN_TEXT) || []).some((m) => cents(Number(m.replace(/[^\d.-]/g, ''))) === target)
          } else if (mark.text) {
            const needle = normKey(mark.text)
            hit = needle.length >= 3 && normKey(cell.text).includes(needle)
          }
          if (!hit) return
          perMark.set(mi, (perMark.get(mi) || 0) + 1)
          const h = cell.h || 10
          boxes.push({
            page: pageIdx,
            left: (cell.x - 2) / W,
            top: (row.y - h * 0.95) / H,
            width: (cell.x2 - cell.x + 4) / W,
            height: (h * 1.25) / H,
          })
        })
      }
    }
  })
  return boxes
}
