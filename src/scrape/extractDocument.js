// Reads an invoice or quote out of a PDF's positioned text (see readPdf.js):
// invoice/quote number, total, subtotal, tax, shipping, markup and line items.
// Pure function -- no pdf.js, DOM or network -- so it can be run against
// sample PDFs from a plain Node script.
//
// Method: group text into rows by vertical position, find a "label" cell
// (Invoice Number, Total, Subtotal...), then take the value to its right on
// the same row, or failing that directly beneath it. Line items are found by
// the one thing every table has in common: on a real line, qty x unit price =
// amount. Everything reports where it came from, and anything not found is
// left out rather than guessed -- and the line items are only trusted if they
// add back up to the document's own subtotal or total (`reconciled`).

const CURRENCIES = new Set(['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN'])

// --- layout -----------------------------------------------------------

export function buildRows(items) {
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
      if (prev && it.x - prev.x2 < 3.5 && it.str !== '$' && prev.text !== '$') {
        prev.text = `${prev.text} ${it.str}`
        prev.x2 = it.x + it.w
      } else {
        cells.push({ text: it.str, x: it.x, x2: it.x + it.w })
      }
    }
    // A lone "$" belongs to the number after it ("$  17,257"), however far
    // apart a spreadsheet-style layout sets them.
    for (let i = cells.length - 2; i >= 0; i--) {
      if (/^(?:US|CA)?\$$/.test(cells[i].text)) {
        cells[i + 1] = { text: `${cells[i].text} ${cells[i + 1].text}`, x: cells[i].x, x2: cells[i + 1].x2 }
        cells.splice(i, 1)
      }
    }
    return { y: row.y, cells }
  })
}

// --- value parsers ----------------------------------------------------

// "$1,287.00", "CAD $ 267.00", "21.50", "$37.75 USD". Cents are required
// unless there's a $ sign, so quantities and part numbers aren't read as money.
export function parseMoney(text) {
  const t = text.trim()
  let m = t.match(/^(?:([A-Z]{3})\s*)?(?:US|CA|C|A)?\$?\s*(-?\d[\d,]*\.\d{2})(?:\s*([A-Z]{3}))?$/)
  if (!m) m = t.match(/^(?:([A-Z]{3})\s*)?(?:US|CA|C|A)?\$\s*(-?\d[\d,]*)(?:\s*([A-Z]{3}))?$/)
  if (!m) return null
  const value = Number(m[2].replace(/,/g, ''))
  if (Number.isNaN(value)) return null
  const currency = [m[1], m[3]].find((c) => c && CURRENCIES.has(c)) || null
  return { value, currency }
}

// A quantity: a plain number, optionally followed by a unit ("1 EA").
function parseQty(text) {
  const m = text
    .trim()
    .match(/^(\d+(?:\.\d+)?)(?:\s*(?:EA|PC|PCS|UNIT|UNITS|EACH|SET|SETS|FT|M|LB|KG|BOX|HR|HRS|LOT))?$/i)
  return m ? Number(m[1]) : null
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

const round2 = (n) => Math.round(n * 100) / 100
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol

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

  // A value in a larger/bolder font sits a few points lower than its label
  // and lands in the next row, but to the right it's still the same line.
  for (let r = rowIdx + 1; r < rows.length && rows[r].y - row.y <= 6; r++) {
    for (const c of rows[r].cells) {
      if (c.x < label.x2 - 2) continue
      v = tryText(c.text)
      if (v) return { ...v, currency: v.currency || currency, how: 'right' }
    }
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

const moneyOnly = (t) => parseMoney(t)

// --- invoice / quote number -------------------------------------------

const idValue = (t) => {
  const id = parseIdToken(t)
  return id ? { value: id } : null
}

// A leading "4)" is how numbered forms label their boxes ("4) invoice no").
const BOX = '(?:\\d{1,2}\\)\\s*)?'

const INVOICE_NUMBER_LABELS = [
  { tier: 1, re: new RegExp(`^${BOX}(?:invoice|facture|inv)\\s*(?:number|no\\.?|num\\.?|#|id)\\s*[:#.]?`, 'i') },
  { tier: 2, re: /^invoice\s*:/i },
  // A bare "INVOICE" / "INVOICE - FACTURE" column heading with the number
  // printed underneath it (customs/brokerage style invoices).
  { tier: 3, re: /^invoice(?:\s*[-–/]\s*facture)?\s*$/i },
]

const QUOTE_NUMBER_LABELS = [
  {
    tier: 1,
    re: new RegExp(
      `^${BOX}(?:quote|quotation|estimate|proposal)\\s*(?:number|no\\.?|num\\.?|#|id|ref(?:erence)?\\.?)\\s*[:#.]?`,
      'i'
    ),
  },
  { tier: 2, re: /^(?:quote|quotation|estimate)\s*:/i },
]

function findNumber(pages, labels) {
  const found = []
  pages.forEach((page, pageIdx) => {
    const rows = buildRows(page.items)
    rows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, cellIdx) => {
        for (const { tier, re } of labels) {
          const m = cell.text.match(re)
          if (!m) continue
          const v = findValue(rows, rowIdx, cellIdx, cell.text.slice(m[0].length), idValue)
          if (v) found.push({ tier, pageIdx, rowIdx, value: v.value, label: cell.text })
          break
        }
      })
    })
  })
  // Best label wins; the earliest on the page breaks ties (the header, not a
  // later reference to some other number).
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
          const v = findValue(rows, rowIdx, cellIdx, cell.text.slice(m[0].length), moneyOnly)
          if (v) {
            found.push({
              tier,
              rowIdx,
              pageIdx,
              value: v.value,
              currency: v.currency || m[1] || null,
              label: cell.text,
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

// --- line item table --------------------------------------------------

const HEADER_QTY = /^(?:qty\.?|quan(?:tity)?\.?|(?:qty|quantity)\s*&\s*unit|units?)\.?$/i
const HEADER_PRICE = /^(?:unit\s*price(?:\s*\(\w+\))?|unit\s*cost|price\s*each|rate|price)\.?$/i
const HEADER_AMOUNT = /^(?:amount(?:\s*-\s*montant)?|extension|ext\.?|line\s*total|net\s*(?:price|amount)|total(?:\s*\(\w+\))?)$/i
// A column holding what was bought, as opposed to a longer description of it.
const HEADER_NAME = /^(?:product|service|product\s*\/\s*service|product\s*name|name)$/i
const HEADER_DESC = /(?:^|\s)(?:description|items?|particulars|details)\s*:?$/i
const HEADER_PART = /(?:part|sku|item|catalog(?:ue)?|product|model)\s*(?:no\.?|number|#|code|id)\b|^p\/n$|^mfr?\.?\s*p/i

// The row that names the table's columns: at least two different kinds of
// column heading, one of them a quantity/price/amount.
export function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const kinds = new Set()
    for (const c of rows[i].cells) {
      if (HEADER_QTY.test(c.text)) kinds.add('qty')
      else if (HEADER_PRICE.test(c.text)) kinds.add('price')
      else if (HEADER_AMOUNT.test(c.text)) kinds.add('amount')
      else if (HEADER_DESC.test(c.text)) kinds.add('desc')
    }
    if (kinds.size >= 2 && (kinds.has('qty') || kinds.has('price') || kinds.has('amount'))) return i
  }
  return -1
}

// Where the table stops: the first row carrying a subtotal/total-style label.
const TABLE_END =
  /^(?:sub\s*-?\s*total|total\b|balance\b|amount\s+due|merchandise\b|invoice\s+amounts|tax\s+summary|tot:)/i

export function findTableEnd(rows, from) {
  for (let i = from; i < rows.length; i++) {
    if (rows[i].cells.some((c) => TABLE_END.test(c.text))) return i
  }
  return rows.length
}

const SHIPPING_WORDS = /\b(?:shipping|freight|handling|courier|delivery)\b/i
const MARKUP_WORDS = /\bmark-?\s?up\b/i

// A product-style token (4347K336, SMAAF2050, FASMA65-15079003C): one
// unbroken cell with both letters and digits.
const PART_TOKEN = /^(?=[^\s]*\d)(?=[^\s]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9\-/.]{3,}$/

// Wrapped cells join without a space after a trailing hyphen
// ("SMA-SMAFAN310-" + "AV69-09").
function joinTexts(texts) {
  return texts.reduce((out, t) => (!out ? t : out.endsWith('-') ? out + t : `${out} ${t}`), '')
}

// Candidate line rows. Strategy 1 = qty x price = amount, found anywhere in a
// small vertical window (qty or price may be printed a row above/below the
// description). Strategy 2 = price + qty with no amount column. Strategy 3 =
// a row with just a description and one amount (services, fees).
export function findAnchors(rows, start, end) {
  const nums = []
  for (let r = start; r < end; r++) {
    for (const c of rows[r].cells) {
      const money = parseMoney(c.text)
      const qty = parseQty(c.text)
      if ((money && money.value > 0) || (qty !== null && qty > 0)) {
        nums.push({
          r,
          y: rows[r].y,
          x: c.x,
          x2: c.x2,
          money: money && money.value > 0 ? money.value : null,
          qty: qty !== null && qty > 0 ? qty : null,
          used: false,
        })
      }
    }
  }
  const moneyCells = nums.filter((n) => n.money !== null)

  const s1 = []
  for (const a of [...moneyCells].sort((p, q) => p.y - q.y || q.x - p.x)) {
    if (a.used) continue
    let best = null
    for (const p of moneyCells) {
      if (p === a || p.used || p.x >= a.x - 1 || Math.abs(p.y - a.y) > 36) continue
      for (const q of nums) {
        if (q === a || q === p || q.used || q.qty === null || Math.abs(q.y - a.y) > 36) continue
        if (!near(q.qty * p.money, a.money, Math.max(0.02, a.money * 0.0005))) continue
        // A line-number column ("1", "2"...) satisfies qty x price too, so the
        // quantity cell nearest the price column wins.
        const score = Math.abs(p.y - a.y) + Math.abs(q.y - a.y) + (q.x > a.x ? 50 : 0) + Math.abs(q.x - p.x) / 20
        if (!best || score < best.score) best = { p, q, score }
      }
    }
    if (best) {
      a.used = best.p.used = best.q.used = true
      s1.push({ strategy: 1, y: Math.min(a.y, best.p.y), cells: [a, best.p, best.q], qty: best.q.qty, unit: best.p.money, amount: a.money })
    }
  }

  const s2 = []
  for (const p of [...moneyCells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (p.used) continue
    let q = null
    for (const c of nums) {
      if (c === p || c.used || c.qty === null || Math.abs(c.y - p.y) > 4) continue
      if (!q || Math.abs(c.x - p.x) < Math.abs(q.x - p.x)) q = c
    }
    if (!q) continue
    const amount = round2(q.qty * p.money)
    p.used = q.used = true
    // The row's own amount cell, if it has one, is spoken for too.
    for (const c of moneyCells) {
      if (!c.used && Math.abs(c.y - p.y) <= 4 && near(c.money, amount)) c.used = true
    }
    s2.push({ strategy: 2, y: p.y, cells: [p, q], qty: q.qty, unit: p.money, amount })
  }

  const s3 = []
  for (let r = start; r < end; r++) {
    const rowMoney = moneyCells.filter((n) => n.r === r && !n.used)
    if (rowMoney.length === 0) continue
    const hasText = rows[r].cells.some((c) => /[A-Za-z]{3}/.test(c.text) && !parseMoney(c.text) && c.x < rowMoney[0].x)
    if (!hasText) continue
    const amt = rowMoney[rowMoney.length - 1]
    rowMoney.forEach((n) => (n.used = true))
    s3.push({ strategy: 3, y: amt.y, cells: rowMoney, qty: 1, unit: amt.money, amount: amt.money })
  }

  return { s1, s2, s3 }
}

// Turn anchors into lines by reading each one's description (and part
// number) from the text between it and the next anchor, in the description
// column. Shipping and markup lines are pulled out of the item list.
export function buildLines(rows, start, end, header, anchors) {
  const sorted = [...anchors].sort((a, b) => a.y - b.y)
  if (sorted.length === 0) return null

  const headerCells = rows[header].cells
  const descHeader =
    headerCells.find((c) => /description$/i.test(c.text)) || headerCells.find((c) => HEADER_DESC.test(c.text)) || null
  const partHeader = headerCells.find((c) => HEADER_PART.test(c.text) && c !== descHeader) || null
  const numericLeft = Math.min(...sorted.flatMap((a) => a.cells.map((c) => c.x)))
  const descRight = numericLeft - 2

  // The description column starts where the heading before it ends -- not at
  // its own heading, which spreadsheet-style forms centre over left-aligned
  // text. A "Product/Service" heading just before it is part of the column.
  let descLeft = 0
  if (descHeader) {
    const before = headerCells
      .filter((c) => c !== descHeader && c.x2 <= descHeader.x + 1)
      .sort((a, b) => b.x2 - a.x2)[0]
    if (before) descLeft = HEADER_NAME.test(before.text) ? before.x - 3 : before.x2 - 1
  }

  // Part-number column: from its heading to the description column.
  let partLeft = null
  let partRight = null
  if (partHeader && descHeader && partHeader.x < descHeader.x) {
    partLeft = partHeader.x - 3
    partRight = descHeader.x - 3
  }

  const items = []
  let shipping = null
  let markup = null

  sorted.forEach((a, i) => {
    const yFrom = a.y - 4
    const yTo = i + 1 < sorted.length ? sorted[i + 1].y - 4 : Infinity
    const segRows = []
    for (let r = start; r < end; r++) {
      if (rows[r].y < yFrom || rows[r].y >= yTo) continue
      segRows.push(rows[r])
    }

    const descRows = []
    const partTexts = []
    let lastY = null
    for (const row of segRows) {
      const inDesc = row.cells.filter(
        (c) =>
          c.x >= descLeft &&
          c.x < descRight &&
          !(partLeft !== null && c.x >= partLeft && c.x < partRight) &&
          parseMoney(c.text) === null &&
          parseQty(c.text) === null &&
          !CURRENCIES.has(c.text) &&
          c.text !== '$'
      )
      if (partLeft !== null) {
        for (const c of row.cells) if (c.x >= partLeft && c.x < partRight) partTexts.push(c.text)
      }
      if (inDesc.length === 0) continue
      // A big vertical gap ends the description (what follows is boilerplate
      // under the table, not part of this line).
      if (lastY !== null && row.y - lastY > 16) break
      if (descRows.length >= 8) break
      lastY = row.y
      descRows.push(inDesc.map((c) => c.text))
    }

    let partNumber = partTexts.length ? joinTexts(partTexts) : ''
    if (!partNumber) {
      // No part-number column: a product-style token inside the description.
      for (const cells of descRows) {
        const idx = cells.findIndex((t) => PART_TOKEN.test(t))
        if (idx !== -1) {
          partNumber = cells[idx]
          cells.splice(idx, 1)
          break
        }
      }
    }
    let description = joinTexts(descRows.map((cells) => cells.join(' ')).filter(Boolean))
    if (description.length > 240) description = `${description.slice(0, 240).replace(/\s+\S*$/, '')}…`
    if (!partNumber) {
      // "Part # 1SFN166521R1070" written inside the description text.
      const m = description.match(/\b(?:part|p\/n|pn|model|sku)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/.]{3,})/i)
      if (m && /\d/.test(m[1])) partNumber = m[1].replace(/[.,]+$/, '')
    }
    const firstRow = descRows[0] ? descRows[0].join(' ') : ''

    if (SHIPPING_WORDS.test(firstRow)) {
      shipping = round2((shipping || 0) + a.amount)
    } else if (MARKUP_WORDS.test(firstRow)) {
      const rate = description.match(/(\d+(?:\.\d+)?)\s*%/)
      markup = { amount: a.amount, rate: rate ? Number(rate[1]) : null }
    } else {
      items.push({ description, partNumber, quantity: a.qty, unitPrice: a.unit, amount: a.amount })
    }
  })

  return { items, shipping, markup }
}

// Does the table add back up to the document's own numbers?
function reconcile(lines, totals) {
  const L = lines.items.reduce((s, i) => s + i.amount, 0)
  const M = lines.markup ? lines.markup.amount : 0
  const S = lines.shipping ?? totals.labelShipping ?? 0
  const T = totals.taxAmount || 0
  const { subtotal, total } = totals
  // A document printed in whole dollars ("$ 17,257") can sit up to 50 cents
  // away from lines that add to 17,257.26; one with cents must match exactly.
  const tol = (v) => (Number.isInteger(v) ? 0.5 : 0.02)
  if (subtotal !== null) {
    const t = tol(subtotal)
    if (near(L + M, subtotal, t) || near(L + M + S, subtotal, t) || near(L, subtotal, t)) return true
  }
  if (total !== null) {
    const t = tol(total)
    if (near(L + M + S + T, total, t) || near(L + M + S, total, t)) return true
  }
  return false
}

function extractLines(pages, totals) {
  for (let pageIdx = 0; pageIdx < Math.min(pages.length, 3); pageIdx++) {
    const rows = buildRows(pages[pageIdx].items)
    const header = findHeaderRow(rows)
    if (header === -1) continue
    const start = header + 1
    const end = findTableEnd(rows, start)
    const { s1, s2, s3 } = findAnchors(rows, start, end)

    const candidates = [s1, [...s1, ...s2], [...s1, ...s2, ...s3]]
    let fallback = null
    for (const anchors of candidates) {
      const lines = buildLines(rows, start, end, header, anchors)
      if (!lines || lines.items.length + (lines.shipping ? 1 : 0) + (lines.markup ? 1 : 0) === 0) continue
      if (reconcile(lines, totals)) return { ...lines, reconciled: true, page: pageIdx + 1, tableEnd: end }
      // Keep an unreconciled attempt only if every line passed the
      // qty x price = amount check (strategy 1): a table guessed from bare
      // numbers that doesn't add up isn't worth showing.
      if (!fallback && anchors === candidates[0]) fallback = lines
    }
    if (fallback) return { ...fallback, reconciled: false, page: pageIdx + 1, tableEnd: end }
  }
  return null
}

// --- tax, subtotal, shipping ------------------------------------------

const TAX_LABEL =
  /^(?:total\s+)?(?:(?:gst|hst|pst|qst|vat)(?:\s*\/\s*(?:gst|hst|pst|qst))?|sales\s+tax|tax)\b(?!\s*(?:no\b|number|#|registration|reg\b|id\b|summary|exempt|included|rate\s*$))/i
const SUBTOTAL_LABEL = /^(?:sub\s*-?\s*total|merchandise\s+(?:amount|total))\s*:?/i
const SHIPPING_LABEL =
  /^(?:shipping(?:\s*(?:&|and|\/)\s*handling)?|freight(?:\s*\/\s*\w+)?|handling|estimated\s+shipping|delivery)(?:\s+(?:charges?|fees?|cost))?\s*:?/i

// Totals-block labels, read from the rows below the line item table (so a
// "HST ON" tax-code column inside the table is never mistaken for a tax line).
function extractSummary(pages, totalPageIdx, tableEndRow) {
  const rows = buildRows(pages[totalPageIdx].items)
  const from = tableEndRow ?? 0
  let subtotal = null
  let shipping = null
  const taxes = []

  for (let r = from; r < rows.length; r++) {
    // Many invoices repeat their tax in a "TAX SUMMARY" box beneath the totals.
    if (rows[r].cells.some((c) => /^taxs+summary/i.test(c.text))) break
    rows[r].cells.forEach((cell, cellIdx) => {
      let m = cell.text.match(SUBTOTAL_LABEL)
      if (m && subtotal === null) {
        const v = findValue(rows, r, cellIdx, cell.text.slice(m[0].length), moneyOnly, { allowBelow: false })
        if (v) subtotal = v.value
        return
      }
      m = cell.text.match(SHIPPING_LABEL)
      if (m && shipping === null) {
        const v = findValue(rows, r, cellIdx, cell.text.slice(m[0].length), moneyOnly, { allowBelow: false })
        if (v) shipping = v.value
        return
      }
      m = cell.text.match(TAX_LABEL)
      if (m) {
        const v = findValue(rows, r, cellIdx, cell.text.slice(m[0].length), moneyOnly, { allowBelow: false })
        if (v) {
          const pct = cell.text.match(/(\d+(?:\.\d+)?)\s*%/)
          if (!taxes.some((t) => t.label === cell.text && t.amount === v.value)) {
            taxes.push({ label: cell.text, amount: v.value, rate: pct ? Number(pct[1]) : null })
          }
        }
      }
    })
  }

  let tax = null
  if (taxes.length > 0) {
    const stated = taxes.every((t) => t.rate !== null)
    tax = {
      amount: round2(taxes.reduce((s, t) => s + t.amount, 0)),
      rate: stated ? round2(taxes.reduce((s, t) => s + t.rate, 0)) : null,
      stated,
    }
  }
  return { subtotal, shipping, tax }
}

// --- public -----------------------------------------------------------

export function extractDocument(pages) {
  const hasText = pages.some((p) => p.items.length > 0)
  if (!hasText) return { hasText: false }

  const invoiceNumber = findNumber(pages, INVOICE_NUMBER_LABELS)
  const quoteNumber = findNumber(pages.slice(0, 1), QUOTE_NUMBER_LABELS)
  const total = findTotal(pages)

  // Line items first (they decide where the table ends), then the
  // subtotal/tax/shipping labels beneath it on the page the total is on.
  const totalPageIdx = total ? total.pageIdx : 0
  const preSummary = extractSummary(pages, totalPageIdx, null)
  const preLines = extractLines(pages, {
    subtotal: preSummary.subtotal,
    total: total ? total.value : null,
    taxAmount: preSummary.tax ? preSummary.tax.amount : 0,
    labelShipping: preSummary.shipping,
  })
  // Re-read the summary from below the table when the table is on the same
  // page, so tax-code columns inside it can't be mistaken for tax lines. A
  // table that runs off the bottom of its page without a totals row
  // continues on the next page, which is where its subtotal and tax are.
  let summary = preSummary
  if (preLines) {
    const tablePageIdx = preLines.page - 1
    const tableRowCount = buildRows(pages[tablePageIdx].items).length
    if (preLines.tableEnd >= tableRowCount && pages[tablePageIdx + 1]) {
      summary = extractSummary(pages, tablePageIdx + 1, null)
    } else if (tablePageIdx === totalPageIdx) {
      summary = extractSummary(pages, totalPageIdx, preLines.tableEnd)
    }
  }
  const lines = preLines
    ? extractLines(pages, {
        subtotal: summary.subtotal,
        total: total ? total.value : null,
        taxAmount: summary.tax ? summary.tax.amount : 0,
        labelShipping: summary.shipping,
      })
    : preLines

  let tax = summary.tax
  // A tax line that doesn't state its rate ("HST 13%") has to earn its place:
  // subtotal + tax must make the total, or it's some other row that happens
  // to mention GST (a customs breakdown, a tax-code column...).
  if (tax && !tax.stated) {
    const sub = summary.subtotal
    const ship = summary.shipping || 0
    const adds =
      sub !== null && total && (near(sub + tax.amount, total.value) || near(sub + ship + tax.amount, total.value))
    if (!adds) tax = null
  }
  if (tax && tax.rate === null) {
    const base = summary.subtotal ?? (total ? total.value - tax.amount : null)
    if (base && base > 0) tax = { ...tax, rate: round2((tax.amount / base) * 100) }
  }

  let markup = lines && lines.markup ? { ...lines.markup } : null
  if (markup && markup.rate === null && lines.items.length > 0) {
    const base = lines.items.reduce((s, i) => s + i.amount, 0)
    if (base > 0) markup.rate = round2((markup.amount / base) * 100)
  }

  return {
    hasText: true,
    invoiceNumber: invoiceNumber
      ? { value: invoiceNumber.value, page: invoiceNumber.pageIdx + 1, label: invoiceNumber.label }
      : null,
    quoteNumber: quoteNumber ? { value: quoteNumber.value, page: quoteNumber.pageIdx + 1, label: quoteNumber.label } : null,
    amount: total
      ? { value: total.value, currency: total.currency, page: total.pageIdx + 1, label: total.label }
      : null,
    subtotal: summary.subtotal,
    tax,
    shipping: lines && lines.shipping !== null ? lines.shipping : summary.shipping,
    markup,
    lines: lines
      ? { items: lines.items, reconciled: lines.reconciled, page: lines.page }
      : null,
  }
}
