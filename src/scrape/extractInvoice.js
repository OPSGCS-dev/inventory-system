// Pulls an invoice number and total out of a PDF's positioned text (see
// readPdf.js). Pure function -- no pdf.js, DOM or network -- so it can be run
// against sample PDFs from a plain Node script.
//
// Method: group text into rows by vertical position, find a "label" cell
// (Invoice Number, Total, Amount Due...), then take the value to its right on
// the same row, or failing that directly beneath it. Every field reports where
// it came from so the UI can show the user what was read, and anything it
// can't find is simply left out rather than guessed.

const CURRENCIES = new Set(['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN'])

// --- layout -----------------------------------------------------------

function buildRows(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows = []
  for (const it of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(it.y - last.y) <= 3) {
      last.items.push(it)
    } else {
      rows.push({ y: it.y, items: [it] })
    }
  }
  return rows.map((row) => {
    const items = row.items.sort((a, b) => a.x - b.x)
    // Neighbouring items that nearly touch are one visual phrase
    // ("Invoice:" + "65529349"), so merge them into a single cell.
    const cells = []
    for (const it of items) {
      const prev = cells[cells.length - 1]
      if (prev && it.x - prev.x2 < 3.5) {
        prev.text = `${prev.text} ${it.str}`
        prev.x2 = it.x + it.w
      } else {
        cells.push({ text: it.str, x: it.x, x2: it.x + it.w })
      }
    }
    return { y: row.y, cells }
  })
}

// --- value parsers ----------------------------------------------------

// "$1,287.00", "CAD $ 267.00", "21.50", "$37.75 USD". Cents are required
// unless there's a $ sign, so quantities and part numbers aren't read as money.
function parseMoney(text) {
  const t = text.trim()
  let m = t.match(/^(?:([A-Z]{3})\s*)?(?:US|CA|C|A)?\$?\s*(-?\d[\d,]*\.\d{2})(?:\s*([A-Z]{3}))?$/)
  if (!m) m = t.match(/^(?:([A-Z]{3})\s*)?(?:US|CA|C|A)?\$\s*(-?\d[\d,]*)(?:\s*([A-Z]{3}))?$/)
  if (!m) return null
  const value = Number(m[2].replace(/,/g, ''))
  if (Number.isNaN(value)) return null
  const currency = [m[1], m[3]].find((c) => c && CURRENCIES.has(c)) || null
  return { value, currency }
}

const DATE_LIKE =
  /^(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}-[A-Za-z]{3}-\d{2,4})$/

// One unbroken token with at least one digit: SN-2025-120, 65529349,
// E103127247100. Rejects dates, money and ordinary words.
function parseIdToken(text) {
  const t = text.trim().replace(/^#\s*/, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/_.]{2,}$/.test(t)) return null
  if (!/\d/.test(t)) return null
  if (DATE_LIKE.test(t)) return null
  if (/^\d[\d,]*\.\d{2}$/.test(t)) return null
  return t
}

// --- label -> value search -------------------------------------------

// Value on the label's own row (after the label's text, then later cells),
// else directly below it. `parse` turns candidate text into a value or null.
function findValue(rows, rowIdx, cellIdx, rest, parse, { allowBelow = true } = {}) {
  const row = rows[rowIdx]
  const label = row.cells[cellIdx]
  let currency = null

  const tryText = (text) => {
    const t = text.trim()
    if (!t) return undefined
    if (CURRENCIES.has(t)) {
      currency = t
      return undefined
    }
    return parse(t)
  }

  let v = tryText(rest)
  if (v) return { ...v, currency: v.currency || currency, how: 'inline' }

  for (let i = cellIdx + 1; i < Math.min(row.cells.length, cellIdx + 4); i++) {
    v = tryText(row.cells[i].text)
    if (v) return { ...v, currency: v.currency || currency, how: 'right' }
  }

  if (allowBelow) {
    for (let r = rowIdx + 1; r <= Math.min(rows.length - 1, rowIdx + 2); r++) {
      if (rows[r].y - row.y > 32) break
      for (const c of rows[r].cells) {
        if (c.x2 < label.x - 30 || c.x > label.x2 + 30) continue
        v = tryText(c.text)
        if (v) return { ...v, currency: v.currency || currency, how: 'below' }
      }
    }
  }
  return null
}

// --- invoice number ---------------------------------------------------

const INVOICE_NUMBER_LABELS = [
  { tier: 1, re: /^(?:invoice|facture|inv)\s*(?:number|no\.?|num\.?|#|id)\s*[:#.]?/i },
  { tier: 2, re: /^invoice\s*:/i },
  // A bare "INVOICE" / "INVOICE - FACTURE" column heading with the number
  // printed underneath it (customs/brokerage style invoices).
  { tier: 3, re: /^invoice(?:\s*[-–/]\s*facture)?\s*$/i },
]

function findInvoiceNumber(pages) {
  const found = []
  pages.forEach((page, pageIdx) => {
    const rows = buildRows(page.items)
    rows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, cellIdx) => {
        for (const { tier, re } of INVOICE_NUMBER_LABELS) {
          const m = cell.text.match(re)
          if (!m) continue
          const v = findValue(rows, rowIdx, cellIdx, cell.text.slice(m[0].length), (t) => {
            const id = parseIdToken(t)
            return id ? { value: id } : null
          })
          if (v) found.push({ tier, pageIdx, rowIdx, value: v.value, label: cell.text, how: v.how })
          break
        }
      })
    })
  })
  // Best label wins; the earliest on the page breaks ties (the header, not a
  // later reference to some other invoice number).
  found.sort((a, b) => a.tier - b.tier || a.pageIdx - b.pageIdx || a.rowIdx - b.rowIdx)
  return found[0] || null
}

// --- total ------------------------------------------------------------

const TOTAL_EXCLUDE =
  /^(?:sub\s*-?\s*total|net\s+total|total\s+(?:tax|gst|hst|pst|weight|qty|quantity|pkgs?|packages|number|discount|before|exempt|taxable|savings))/i

const TOTAL_LABELS = [
  // What's owed: also covers invoices with a differently-named total.
  { tier: 2, re: /^(?:total\s+(?:amount\s+)?due|amount\s+due|balance\s+due|amount\s+payable)\s*(?:\(\s*([A-Z]{3})\s*\))?\s*:?/i },
  { tier: 1, re: /^(?:invoice\s+total|grand\s+total|total\s+invoice|total\s+amount|total)\s*(?:\(\s*(?:in\s+)?([A-Z]{3})\s*\))?\s*:?/i },
]

function findTotal(pages) {
  // The first page that has any total wins: a PDF is often several documents
  // stapled together (invoice, then the vendor's order confirmation, payment
  // receipt, PO...), each with its own total, and the invoice comes first.
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const rows = buildRows(pages[pageIdx].items)
    const found = []
    rows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, cellIdx) => {
        if (TOTAL_EXCLUDE.test(cell.text)) return
        for (const { tier, re } of TOTAL_LABELS) {
          const m = cell.text.match(re)
          if (!m) continue
          const v = findValue(rows, rowIdx, cellIdx, cell.text.slice(m[0].length), parseMoney)
          if (v) {
            found.push({
              tier,
              rowIdx,
              pageIdx,
              value: v.value,
              currency: v.currency || m[1] || null,
              label: cell.text,
              how: v.how,
            })
          }
          break
        }
      })
    })
    if (found.length > 0) {
      // Best label first; the lowest on the page breaks ties (grand total
      // sits under the subtotal/tax lines).
      found.sort((a, b) => a.tier - b.tier || b.rowIdx - a.rowIdx)
      const best = found[0]
      // A bare "Total:" often has no currency of its own while "Amount Due
      // (CAD)" beside it does -- same page, same document, same currency.
      if (!best.currency) best.currency = found.find((f) => f.currency)?.currency || null
      return best
    }
  }
  return null
}

// --- public -----------------------------------------------------------

export function extractInvoice(pages) {
  const hasText = pages.some((p) => p.items.length > 0)
  if (!hasText) return { hasText: false }

  const number = findInvoiceNumber(pages)
  const total = findTotal(pages)
  return {
    hasText: true,
    invoiceNumber: number ? { value: number.value, page: number.pageIdx + 1, label: number.label } : null,
    amount: total
      ? { value: total.value, currency: total.currency, page: total.pageIdx + 1, label: total.label }
      : null,
  }
}
