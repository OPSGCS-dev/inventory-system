import { Fragment, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { formatMoney, normalizeHeader, formatDateTime } from '../utils'
import { downloadCsv } from '../stockUtils'
import { AMBER, Badge, GREEN, RED, Tile } from './AuditShared'

// Accounting audit, Prices view: what every part costs in the inventory system (its Last Cost on the
// Master List) next to what accounting's books say it costs. The inventory side is live; the books side
// comes from an Excel file accounting uploads, one row per part with a part number and a unit cost.
// Differences must be resolved (accounting corrects its price, or the Last Cost is corrected, with a
// reason) and confirmed before the audit can be signed off. Same shape as the Inventory Counts view.
//
// DEMO SCREEN, like the counts view: it opens with made-up books data, and resolving / signing off is held
// in the browser only. Nothing is written to the Master List or to accounting.

import PartDescription from './PartDescription'

const CENT = 0.005 // prices that agree to the cent match

// Stable pseudo-random number (0-99) from a part number, so the sample data doesn't change on reload.
const roll = (gcs) => (Math.imul(gcs * 2654435761, 1597334677) >>> 0) % 100

const cents = (n) => Math.round(Number(n) * 100) / 100

// Made-up accounting prices, built from the real Last Costs so the demo shows a believable mix: most agree,
// some are a little higher or lower, a few parts are missing from the list, a couple of extra items.
function buildSampleBooks(allParts) {
  const books = new Map()
  for (const p of allParts) {
    if (p.last_cost === null || p.last_cost === undefined) continue
    const cost = Number(p.last_cost)
    const r = roll(p.gcs_id)
    if (r < 72) books.set(p.gcs_id, { price: cents(cost), label: String(p.gcs_id) })
    else if (r < 84) books.set(p.gcs_id, { price: cents(cost * (1.04 + (r % 5) * 0.03)), label: String(p.gcs_id) }) // books higher
    else if (r < 94) books.set(p.gcs_id, { price: cents(cost * (0.9 - (r % 4) * 0.04)), label: String(p.gcs_id) }) // books lower
    // else: not on the list at all
  }
  const maxId = allParts.reduce((m, p) => Math.max(m, p.gcs_id), 0)
  books.set(maxId + 900001, { price: 48.5, label: String(maxId + 900001) }) // on accounting's list, not in the Master List
  books.set(maxId + 900002, { price: 1210, label: String(maxId + 900002) })
  return books
}

const PN_HEADERS = ['gcspn', 'gcsid', 'gcspartid', 'pn', 'partnumber', 'partno', 'part', 'item', 'itemnumber', 'sku']
const PRICE_HEADERS = [
  'cost', 'unitcost', 'price', 'unitprice', 'lastcost', 'costeach', 'priceeach', 'bookcost', 'bookprice',
  'averagecost', 'avgcost', 'standardcost', 'unitvalue', 'costperunit', 'priceperunit',
]

// "$1,234.50" -> 1234.5 (null if there's no number in it).
function parsePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? cents(v) : null
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? cents(n) : null
}

// Reads accounting's Excel/CSV: a part-number column and a cost column, the header row anywhere in the
// first 15 rows. A part number that's a plain number is the GCS P/N; anything else is looked up as a Part ID
// or manufacturer part number. A row that matches nothing is kept under its own text, so it shows as
// "Not in inventory" rather than vanishing. If a part appears twice the last row wins.
function parsePriceFile(rows, allParts) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const heads = rows[i].map((c) => normalizeHeader(String(c ?? '')))
    const pn = heads.findIndex((h) => PN_HEADERS.includes(h))
    const price = heads.findIndex((h) => PRICE_HEADERS.includes(h))
    if (pn < 0 || price < 0) continue
    const byText = new Map()
    for (const p of allParts) {
      for (const t of [p.gcs_part_id, p.manufacturer_part_number]) {
        const k = String(t ?? '').trim().toLowerCase()
        if (k && !byText.has(k)) byText.set(k, p.gcs_id)
      }
    }
    const known = new Set(allParts.map((p) => p.gcs_id))
    const books = new Map()
    const bad = []
    let repeated = 0
    for (let r = i + 1; r < rows.length; r++) {
      const raw = rows[r][pn]
      if (raw === '' || raw == null) continue
      const text = String(raw).trim()
      const p = parsePrice(rows[r][price])
      if (p === null || p < 0) { bad.push(r + 1); continue }
      let key = null
      if (/^\d+(\.0+)?$/.test(text)) key = parseInt(text, 10)
      else if (byText.has(text.toLowerCase())) key = byText.get(text.toLowerCase())
      const id = key !== null && known.has(key) ? key : null
      const mapKey = id !== null ? id : key !== null ? key : 'x:' + text.toLowerCase()
      if (books.has(mapKey)) repeated++
      books.set(mapKey, { price: p, label: text })
    }
    return { books, bad, repeated }
  }
  return { error: 'Could not find a part-number column and a cost column. Use headers like "GCS P/N" and "Unit Cost".' }
}

const money = (n) => formatMoney(n)
const fmtDiff = (d) => (d > 0 ? '+' : d < 0 ? '−' : '') + formatMoney(Math.abs(d))

function AuditPricesPanel({ stockItems, stockLoading, parts, userName }) {
  const fileRef = useRef(null)
  const [uploaded, setUploaded] = useState(null) // { name, books, bad, repeated } once accounting's file is loaded
  const [uploadError, setUploadError] = useState('')
  const [resolutions, setResolutions] = useState({}) // row key -> { action, note, by, at }
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({ action: 'books', note: '' })
  const [filter, setFilter] = useState('review')
  const [search, setSearch] = useState('')
  const [signedOff, setSignedOff] = useState(null)

  const sampleBooks = useMemo(() => buildSampleBooks(parts), [parts])
  const books = uploaded ? uploaded.books : sampleBooks
  const sourceLabel = uploaded ? uploaded.name : 'Sample accounting prices (made up for the demo)'

  const rows = useMemo(() => {
    const unitsOf = new Map(stockItems.map((i) => [i.gcs_id, i.onHandSum]))
    const out = []
    const seen = new Set()
    for (const p of parts) {
      const entry = books.get(p.gcs_id)
      const inv = p.last_cost === null || p.last_cost === undefined ? null : cents(p.last_cost)
      seen.add(p.gcs_id)
      if (inv === null && !entry) continue
      const acc = entry ? entry.price : null
      out.push(makeRow(p.gcs_id, p.gcs_id, p, inv, acc, unitsOf.get(p.gcs_id) || 0, resolutions[p.gcs_id]))
    }
    for (const [key, entry] of books) {
      if (typeof key === 'number' && seen.has(key)) continue
      out.push(makeRow(String(key), null, null, null, entry.price, 0, resolutions[String(key)], entry.label))
    }
    const rank = (r) => (r.needsReview && !r.res ? 0 : r.needsReview ? 1 : 2)
    return out.sort((a, b) => rank(a) - rank(b) || String(a.id ?? a.label).localeCompare(String(b.id ?? b.label), undefined, { numeric: true }))
  }, [parts, stockItems, books, resolutions])

  const counts = useMemo(() => {
    const c = { total: rows.length, match: 0, open: 0, confirmed: 0, impact: 0 }
    for (const r of rows) {
      if (!r.needsReview) c.match++
      else if (r.res) c.confirmed++
      else c.open++
      if (r.inv !== null && r.acc !== null) c.impact += r.diff * r.units
    }
    return c
  }, [rows])

  const shown = rows.filter((r) => {
    if (filter === 'review' && !(r.needsReview && !r.res)) return false
    if (filter === 'confirmed' && !(r.needsReview && r.res)) return false
    if (filter === 'match' && r.needsReview) return false
    if (search) {
      const q = search.toLowerCase()
      if (!String(r.id ?? '').includes(q) && !(r.part?.description || '').toLowerCase().includes(q) && !String(r.label || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const result = parsePriceFile(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }), parts)
      if (result.error) { setUploadError(result.error); return }
      setUploaded({ name: file.name, books: result.books, bad: result.bad, repeated: result.repeated })
      setResolutions({})
      setOpenId(null)
      setSignedOff(null)
      setFilter('review')
    } catch (err) {
      console.error(err)
      setUploadError('Could not read that file. Upload an .xlsx, .xls or .csv with a part-number and a cost column.')
    }
  }

  function startResolve(r) {
    setOpenId(r.key)
    setDraft({ action: 'books', note: '' })
  }

  function confirmResolve(r) {
    setResolutions((prev) => ({ ...prev, [r.key]: { action: draft.action, note: draft.note.trim(), by: userName, at: formatDateTime(new Date()) } }))
    setOpenId(null)
  }

  function resolutionText(r) {
    const { action } = r.res
    if (action === 'books') return r.inv === null ? 'Books adjusted' : `Books adjusted to ${money(r.inv)}`
    if (action === 'inventory') return `Inventory Last Cost adjusted to ${money(r.acc ?? 0)}`
    return 'Explained / no change'
  }

  function exportAudit() {
    const csv = Papa.unparse(
      rows.map((r) => ({
        'GCS P/N': r.id ?? '',
        'Listed as': r.part ? '' : r.label || '',
        Description: r.part?.description || '',
        'Inventory cost (Last Cost)': r.inv ?? '',
        'Accounting cost': r.acc ?? '',
        Difference: r.inv === null || r.acc === null ? '' : r.diff.toFixed(2),
        'Difference %': r.pct === null ? '' : r.pct.toFixed(1),
        'Units on hand': r.units,
        Status: !r.needsReview ? 'Match' : r.res ? 'Confirmed' : 'Needs review',
        Resolution: r.res ? resolutionText(r) : '',
        Note: r.res?.note || '',
        'Confirmed by': r.res?.by || '',
        'Confirmed at': r.res?.at || '',
      }))
    )
    downloadCsv(`price-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const cols = 8

  return (
    <>
      <div className="card" style={{ background: '#fff8e1', borderColor: '#ecd58a' }}>
        <strong>Preview.</strong> This screen is a mock-up: the inventory costs are live (each part&apos;s Last Cost), the accounting prices are sample data, and nothing you confirm here is saved.
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Accounting Audit — Prices</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Each part&apos;s cost in the inventory system (Last Cost) against accounting&apos;s books. Source of the books: <strong>{sourceLabel}</strong>
            </p>
          </div>
          <div className="header-actions">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => fileRef.current?.click()}>
              Import Accounting Prices
            </button>
            {uploaded && (
              <button className="btn-secondary" onClick={() => { setUploaded(null); setResolutions({}); setSignedOff(null) }}>
                Back to sample data
              </button>
            )}
            <button className="btn-secondary" onClick={exportAudit} disabled={rows.length === 0}>Export CSV</button>
          </div>
        </div>
        <p className="sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Expected file: one row per part with a part-number column (e.g. &quot;GCS P/N&quot;) and a cost column (e.g. &quot;Unit Cost&quot;). Costs that agree to the cent count as a match.
        </p>
        {uploadError && <div className="status err">{uploadError}</div>}
        {uploaded && (uploaded.bad.length > 0 || uploaded.repeated > 0) && (
          <div className="status err" style={{ background: '#fff8e1', color: 'var(--ink)', borderColor: '#ecd58a' }}>
            {uploaded.bad.length > 0 && <div>Skipped {uploaded.bad.length} row{uploaded.bad.length === 1 ? '' : 's'} with no usable cost (row{uploaded.bad.length === 1 ? '' : 's'} {uploaded.bad.slice(0, 10).join(', ')}{uploaded.bad.length > 10 ? ', …' : ''}).</div>}
            {uploaded.repeated > 0 && <div>{uploaded.repeated} part{uploaded.repeated === 1 ? ' appears' : 's appear'} more than once in the file; the last row for each was used.</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Tile label="Parts compared" value={counts.total} />
          <Tile label="Match" value={counts.match} color={GREEN} />
          <Tile label="Needs review" value={counts.open} color={counts.open ? RED : GREEN} hint={counts.open ? 'prices apart or missing' : 'all clear'} />
          <Tile label="Confirmed" value={counts.confirmed} color={GREEN} hint="differences resolved" />
          <Tile
            label="Value of the differences"
            value={fmtDiff(counts.impact)}
            color={Math.abs(counts.impact) < CENT ? GREEN : AMBER}
            hint="books vs inventory, on the units in stock"
          />
        </div>

        {signedOff ? (
          <div className="status ok" style={{ fontSize: 14 }}>
            Price audit signed off by {signedOff.by} on {signedOff.at}. {counts.confirmed} difference{counts.confirmed === 1 ? '' : 's'} adjusted and confirmed.
            <button className="btn-secondary" style={{ marginLeft: 12 }} onClick={() => setSignedOff(null)}>Reopen audit</button>
          </div>
        ) : (
          <div className="edit-toolbar" style={{ marginTop: 14 }}>
            <button
              className="btn-primary"
              disabled={counts.open > 0 || counts.total === 0}
              onClick={() => setSignedOff({ by: userName, at: formatDateTime(new Date()) })}
            >
              Sign Off Audit
            </button>
            <span className="sub" style={{ margin: 0 }}>
              {counts.open > 0 ? `${counts.open} difference${counts.open === 1 ? '' : 's'} still need to be adjusted and confirmed.` : 'Every difference has been confirmed.'}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="edit-toolbar" style={{ flexWrap: 'wrap' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="review">Needs review ({counts.open})</option>
            <option value="all">All parts ({counts.total})</option>
            <option value="confirmed">Confirmed ({counts.confirmed})</option>
            <option value="match">Matching ({counts.match})</option>
          </select>
          <input type="text" placeholder="Search part number or description" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        </div>

        {stockLoading ? (
          <div className="empty">Loading...</div>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '17%' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">GCS P/N</th>
                  <th>Description</th>
                  <th className="center-cell">Inventory cost</th>
                  <th className="center-cell">Accounting cost</th>
                  <th className="center-cell">Difference</th>
                  <th className="center-cell">On hand</th>
                  <th className="center-cell">Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td className="empty" colSpan={cols}>{filter === 'review' && !search ? 'Nothing needs review.' : 'No parts match.'}</td></tr>
                ) : (
                  shown.map((r) => {
                    const flagged = r.needsReview && !r.res
                    const comparable = r.inv !== null && r.acc !== null
                    return (
                      <Fragment key={r.key}>
                        <tr style={flagged ? { background: '#fdf0ed' } : undefined}>
                          <td className="row-head">{r.id ?? '—'}</td>
                          <td><PartDescription text={r.part?.description || (r.part ? '—' : `Listed as “${r.label}”`)} /></td>
                          <td className="center-cell">{r.inv === null ? '—' : money(r.inv)}</td>
                          <td className="center-cell">{r.acc === null ? '—' : money(r.acc)}</td>
                          <td className="center-cell" style={{ fontWeight: 700, color: !comparable ? AMBER : Math.abs(r.diff) < CENT ? 'var(--muted)' : flagged ? RED : GREEN }}>
                            {!comparable ? 'n/a' : Math.abs(r.diff) < CENT ? '$0.00' : fmtDiff(r.diff)}
                            {comparable && Math.abs(r.diff) >= CENT && r.pct !== null && (
                              <div style={{ fontSize: 11, fontWeight: 400 }}>{r.pct > 0 ? '+' : ''}{r.pct.toFixed(1)}%</div>
                            )}
                          </td>
                          <td className="center-cell">{r.units}</td>
                          <td className="center-cell">
                            {!r.needsReview && <Badge color={GREEN}>Match</Badge>}
                            {flagged && (
                              <Badge color={RED}>
                                {r.status === 'missing_books' ? 'Not on list' : r.status === 'missing_inv' ? 'Not in inventory' : r.status === 'no_cost' ? 'No cost on file' : 'Different'}
                              </Badge>
                            )}
                            {r.needsReview && r.res && <Badge color={GREEN}>Confirmed ✓</Badge>}
                          </td>
                          <td>
                            {flagged && (
                              <button className="btn-secondary" onClick={() => (openId === r.key ? setOpenId(null) : startResolve(r))}>
                                {openId === r.key ? 'Cancel' : 'Adjust & confirm'}
                              </button>
                            )}
                            {r.res && (
                              <div style={{ fontSize: 12 }}>
                                {resolutionText(r)}
                                <div style={{ color: 'var(--muted)' }}>{r.res.by}, {r.res.at}</div>
                                <button className="btn-secondary" style={{ marginTop: 4, padding: '2px 8px', fontSize: 12 }} onClick={() => setResolutions((prev) => { const n = { ...prev }; delete n[r.key]; return n })}>
                                  Reopen
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {openId === r.key && flagged && (
                          <tr>
                            <td colSpan={cols} style={{ background: '#f6f9fe', padding: 14 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                {r.part ? `P/N ${r.id}` : `“${r.label}”`}: inventory has {r.inv === null ? 'no cost' : money(r.inv)}, the books have {r.acc === null ? 'no price' : money(r.acc)}. How is this being resolved?
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                                {[
                                  ['books', r.inv === null ? 'Accounting corrects its list.' : `The inventory cost is right. Accounting adjusts the books to ${money(r.inv)}.`],
                                  ['inventory', r.part ? `The books are right. The part's Last Cost is adjusted to ${money(r.acc ?? 0)}.` : 'The books are right. The part still has to be added to the Master List.'],
                                  ['explained', 'Both are right for now (different supplier, a price change pending, a different unit). Explain below.'],
                                ].map(([val, text]) => (
                                  <label key={val} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                                    <input type="radio" name={`res-${r.key}`} checked={draft.action === val} onChange={() => setDraft((d) => ({ ...d, action: val }))} />
                                    {text}
                                  </label>
                                ))}
                              </div>
                              <div className="edit-toolbar">
                                <input type="text" placeholder="Reason / reference (required)" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} style={{ flex: 1 }} />
                                <button className="btn-primary" disabled={!draft.note.trim()} onClick={() => confirmResolve(r)}>
                                  Confirm
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// One line of the comparison. `key` identifies it for confirming; `id` is the GCS P/N (null for a list item
// that isn't in the Master List); inv / acc are the two costs (null = none).
function makeRow(key, id, part, inv, acc, units, res, label) {
  const diff = inv !== null && acc !== null ? cents(acc - inv) : 0 // positive = books higher than inventory
  let status = 'match'
  if (!part) status = 'missing_inv'
  else if (acc === null) status = 'missing_books'
  else if (inv === null) status = 'no_cost'
  else if (Math.abs(diff) >= CENT) status = 'diff'
  const pct = inv !== null && acc !== null && inv !== 0 ? (diff / inv) * 100 : null
  return { key: String(key), id, part, label, inv, acc, diff, pct, units, status, needsReview: status !== 'match', res }
}

export default AuditPricesPanel
