import { Fragment, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { normalizeHeader } from '../utils'
import { downloadCsv } from '../stockUtils'

// Accounting audit: every part's quantity in the inventory system next to the quantity on
// accounting's books. The inventory side is live (total owned across entities); the books
// side comes from an Excel file accounting uploads. Differences must be resolved (adjust the
// books or the inventory count, with a reason) and confirmed before the audit can be signed off.
//
// DEMO SCREEN: it opens with made-up books data, and resolving / signing off is held in the
// browser only. Nothing is written to inventory or to accounting.

const GREEN = '#2f7a3d'
const RED = '#b0402a'
const AMBER = '#b98900'

// Stable pseudo-random number (0-99) from a part number, so the sample data doesn't change on reload.
const roll = (gcs) => (Math.imul(gcs * 2654435761, 1597334677) >>> 0) % 100

// Made-up accounting books, built from the real inventory so the demo shows a believable mix:
// most parts agree, a few are off by a unit or two, a couple are missing from the books.
function buildSampleBooks(items, allParts) {
  const books = new Map()
  for (const item of items) {
    const inv = item.onHandSum
    if (inv === 0) continue
    const r = roll(item.gcs_id)
    if (r < 76) books.set(item.gcs_id, inv)
    else if (r < 85) books.set(item.gcs_id, inv + 1 + (r % 3)) // books higher
    else if (r < 94) books.set(item.gcs_id, Math.max(0, inv - 1 - (r % 4))) // books lower
    else if (r < 97) books.set(item.gcs_id, 0)
    // else: not on the books at all
  }
  // a couple of parts the books carry that the inventory system has none of
  const have = new Set(items.map((i) => i.gcs_id))
  let extra = 0
  for (const p of allParts) {
    if (extra >= 2) break
    if (!have.has(p.gcs_id) && roll(p.gcs_id) < 50) {
      books.set(p.gcs_id, 2 + (p.gcs_id % 4))
      extra++
    }
  }
  return books
}

// Reads accounting's Excel/CSV. Needs a part-number column and a quantity column; the header
// row can be anywhere in the first 15 rows.
function parseBooksFile(rows) {
  const isPn = (h) => ['gcspn', 'gcsid', 'gcspartid', 'pn', 'partnumber', 'partno', 'part', 'item', 'itemnumber', 'sku'].includes(h)
  const isQty = (h) => ['quantity', 'qty', 'onhand', 'qtyonhand', 'quantityonhand', 'bookqty', 'bookquantity', 'booksquantity', 'balance'].includes(h)
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const heads = rows[i].map((c) => normalizeHeader(String(c ?? '')))
    const pn = heads.findIndex(isPn)
    const qty = heads.findIndex(isQty)
    if (pn >= 0 && qty >= 0) {
      const books = new Map()
      const bad = []
      for (let r = i + 1; r < rows.length; r++) {
        const rawPn = rows[r][pn]
        if (rawPn === '' || rawPn == null) continue
        const g = parseInt(String(rawPn).replace(/[^0-9]/g, ''), 10)
        const q = Number(rows[r][qty])
        if (!Number.isFinite(g) || !Number.isFinite(q)) { bad.push(r + 1); continue }
        books.set(g, (books.get(g) || 0) + Math.round(q))
      }
      return { books, bad }
    }
  }
  return { error: 'Could not find a part-number column and a quantity column. Use headers like "GCS P/N" and "Quantity".' }
}

const fmtDiff = (d) => (d > 0 ? `+${d}` : String(d))

function Badge({ color, children }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, color, background: `${color}1a`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Tile({ label, value, color, hint }) {
  return (
    <div style={{ flex: '1 1 150px', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--card)' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--ink)', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}

function AuditTab({ stockItems, stockLoading, parts, userName }) {
  const fileRef = useRef(null)
  const [uploaded, setUploaded] = useState(null) // { name, books } once accounting's file is loaded
  const [uploadError, setUploadError] = useState('')
  const [resolutions, setResolutions] = useState({}) // gcs -> { action, note, by, at }
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState({ action: 'books', note: '' })
  const [filter, setFilter] = useState('review')
  const [search, setSearch] = useState('')
  const [signedOff, setSignedOff] = useState(null)

  const sampleBooks = useMemo(() => buildSampleBooks(stockItems, parts), [stockItems, parts])
  const books = uploaded ? uploaded.books : sampleBooks
  const sourceLabel = uploaded ? uploaded.name : 'Sample accounting data (made up for the demo)'

  const rows = useMemo(() => {
    const byId = new Map(stockItems.map((i) => [i.gcs_id, i]))
    const ids = new Set([...byId.keys(), ...books.keys()])
    const out = []
    for (const id of ids) {
      const item = byId.get(id)
      const inv = item ? item.onHandSum : 0
      const acc = books.has(id) ? books.get(id) : null
      if (inv === 0 && (acc === null || acc === 0)) continue
      const part = item?.part || parts.find((p) => p.gcs_id === id)
      const diff = (acc ?? 0) - inv // positive = books higher than inventory
      const res = resolutions[id]
      let status = 'match'
      if (acc === null) status = 'missing_books'
      else if (inv === 0 && acc > 0) status = 'missing_inv'
      else if (diff !== 0) status = 'diff'
      const needsReview = status !== 'match'
      out.push({ id, part, inv, acc, diff, status, needsReview, res })
    }
    const rank = (r) => (r.needsReview && !r.res ? 0 : r.needsReview ? 1 : 2)
    return out.sort((a, b) => rank(a) - rank(b) || a.id - b.id)
  }, [stockItems, books, parts, resolutions])

  const counts = useMemo(() => {
    const c = { total: rows.length, match: 0, open: 0, confirmed: 0, openUnits: 0 }
    for (const r of rows) {
      if (!r.needsReview) c.match++
      else if (r.res) c.confirmed++
      else { c.open++; c.openUnits += Math.abs(r.diff) }
    }
    return c
  }, [rows])

  const shown = rows.filter((r) => {
    if (filter === 'review' && !(r.needsReview && !r.res)) return false
    if (filter === 'confirmed' && !(r.needsReview && r.res)) return false
    if (filter === 'match' && r.needsReview) return false
    if (search) {
      const q = search.toLowerCase()
      if (!String(r.id).includes(q) && !(r.part?.description || '').toLowerCase().includes(q) && !(r.part?.gcs_part_id || '').toLowerCase().includes(q)) return false
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
      const result = parseBooksFile(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }))
      if (result.error) { setUploadError(result.error); return }
      setUploaded({ name: file.name, books: result.books })
      setResolutions({})
      setOpenId(null)
      setSignedOff(null)
      setFilter('review')
    } catch (err) {
      console.error(err)
      setUploadError('Could not read that file. Upload an .xlsx, .xls or .csv with a part-number and a quantity column.')
    }
  }

  function startResolve(r) {
    setOpenId(r.id)
    setDraft({ action: 'books', note: '' })
  }

  function confirmResolve(r) {
    setResolutions((prev) => ({ ...prev, [r.id]: { action: draft.action, note: draft.note.trim(), by: userName, at: new Date().toLocaleString() } }))
    setOpenId(null)
  }

  function resolutionText(r) {
    const { action } = r.res
    if (action === 'books') return `Books adjusted to ${r.inv}`
    if (action === 'inventory') return `Inventory count adjusted to ${r.acc ?? 0}`
    return 'Explained / no change'
  }

  function exportAudit() {
    const csv = Papa.unparse(
      rows.map((r) => ({
        'GCS P/N': r.id,
        Description: r.part?.description || '',
        'Inventory qty': r.inv,
        'Accounting qty': r.acc ?? '',
        Difference: r.acc === null ? '' : r.diff,
        Status: !r.needsReview ? 'Match' : r.res ? 'Confirmed' : 'Needs review',
        Resolution: r.res ? resolutionText(r) : '',
        Note: r.res?.note || '',
        'Confirmed by': r.res?.by || '',
        'Confirmed at': r.res?.at || '',
      }))
    )
    downloadCsv(`inventory-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const cols = 7

  return (
    <>
      <div className="card" style={{ background: '#fff8e1', borderColor: '#ecd58a' }}>
        <strong>Preview.</strong> This screen is a mock-up: the inventory side is live, the accounting numbers are sample data, and nothing you confirm here is saved.
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Accounting Audit</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Inventory quantity (all entities) against accounting&apos;s books. Source of the books: <strong>{sourceLabel}</strong>
            </p>
          </div>
          <div className="header-actions">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => fileRef.current?.click()}>
              Import Accounting Excel
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
          Expected file: one row per part with a part-number column (e.g. &quot;GCS P/N&quot;) and a quantity column (e.g. &quot;Quantity&quot;).
        </p>
        {uploadError && <div className="status err">{uploadError}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Tile label="Parts compared" value={counts.total} />
          <Tile label="Match" value={counts.match} color={GREEN} />
          <Tile label="Needs review" value={counts.open} color={counts.open ? RED : GREEN} hint={counts.open ? `${counts.openUnits} units apart` : 'all clear'} />
          <Tile label="Confirmed" value={counts.confirmed} color={GREEN} hint="differences resolved" />
        </div>

        {signedOff ? (
          <div className="status ok" style={{ fontSize: 14 }}>
            Audit signed off by {signedOff.by} on {signedOff.at}. {counts.confirmed} difference{counts.confirmed === 1 ? '' : 's'} adjusted and confirmed.
            <button className="btn-secondary" style={{ marginLeft: 12 }} onClick={() => setSignedOff(null)}>Reopen audit</button>
          </div>
        ) : (
          <div className="edit-toolbar" style={{ marginTop: 14 }}>
            <button
              className="btn-primary"
              disabled={counts.open > 0 || counts.total === 0}
              onClick={() => setSignedOff({ by: userName, at: new Date().toLocaleString() })}
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
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '19%' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">GCS P/N</th>
                  <th>Description</th>
                  <th className="center-cell">Inventory</th>
                  <th className="center-cell">Accounting</th>
                  <th className="center-cell">Difference</th>
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
                    return (
                      <Fragment key={r.id}>
                        <tr style={flagged ? { background: '#fdf0ed' } : undefined}>
                          <td className="row-head">{r.id}</td>
                          <td>{r.part?.description || '—'}</td>
                          <td className="center-cell">{r.inv}</td>
                          <td className="center-cell">{r.acc === null ? '—' : r.acc}</td>
                          <td className="center-cell" style={{ fontWeight: 700, color: r.acc === null ? AMBER : r.diff === 0 ? 'var(--muted)' : flagged ? RED : GREEN }}>
                            {r.acc === null ? 'n/a' : r.diff === 0 ? '0' : fmtDiff(r.diff)}
                          </td>
                          <td className="center-cell">
                            {!r.needsReview && <Badge color={GREEN}>Match</Badge>}
                            {flagged && <Badge color={RED}>{r.status === 'missing_books' ? 'Not on books' : r.status === 'missing_inv' ? 'Not in inventory' : 'Difference'}</Badge>}
                            {r.needsReview && r.res && <Badge color={GREEN}>Confirmed ✓</Badge>}
                          </td>
                          <td>
                            {flagged && (
                              <button className="btn-secondary" onClick={() => (openId === r.id ? setOpenId(null) : startResolve(r))}>
                                {openId === r.id ? 'Cancel' : 'Adjust & confirm'}
                              </button>
                            )}
                            {r.res && (
                              <div style={{ fontSize: 12 }}>
                                {resolutionText(r)}
                                <div style={{ color: 'var(--muted)' }}>{r.res.by}, {r.res.at}</div>
                                <button className="btn-secondary" style={{ marginTop: 4, padding: '2px 8px', fontSize: 12 }} onClick={() => setResolutions((prev) => { const n = { ...prev }; delete n[r.id]; return n })}>
                                  Reopen
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {openId === r.id && flagged && (
                          <tr>
                            <td colSpan={cols} style={{ background: '#f6f9fe', padding: 14 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                P/N {r.id}: inventory has {r.inv}, the books have {r.acc ?? 'nothing'}. How is this being resolved?
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                                {[
                                  ['books', `Inventory is right. Accounting adjusts the books to ${r.inv}.`],
                                  ['inventory', `The books are right. Inventory count is adjusted to ${r.acc ?? 0}.`],
                                  ['explained', 'Both are right for now (timing, in transit, pending invoice). Explain below.'],
                                ].map(([val, text]) => (
                                  <label key={val} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                                    <input type="radio" name={`res-${r.id}`} checked={draft.action === val} onChange={() => setDraft((d) => ({ ...d, action: val }))} />
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

export default AuditTab
