import { useCallback, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import { downloadCsv } from '../stockUtils'
import {
  PO_HISTORY_CATEGORIES,
  PO_HISTORY_EVENTS,
  changeLines,
  eventLabel,
  heldLines,
  historyCsvRow,
  poLabelOf,
  summarize,
} from '../poHistory'

// The audit trail for purchase orders: one row per step in a PO's life -- who did what, and when --
// with exactly which fields changed. It is written by database triggers (supabase/add_po_history.sql),
// so it covers every way a PO can change, it can't be edited from here, and each row is chained to the
// one before it so any tampering shows up under "Verify integrity". Filtering happens in the database,
// so it stays fast however long the history gets.

const PAGE = 100
const EXPORT_PAGE = 1000
const EXPORT_LIMIT = 50000
const EMPTY = { text: '', actor: '', entity: '', vendor: '', category: '', event: '', from: '', to: '' }

// The start of a local calendar day as an ISO instant (what the database compares against).
const dayStart = (yyyyMmDd, plusDays = 0) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d + plusDays).toISOString()
}

function applyFilters(query, f, focusId) {
  let q = query
  if (focusId) q = q.eq('purchase_request_id', focusId)
  if (f.from) q = q.gte('happened_at', dayStart(f.from))
  if (f.to) q = q.lt('happened_at', dayStart(f.to, 1))
  if (f.actor === 'system') q = q.is('actor_id', null)
  else if (f.actor) q = q.eq('actor_id', Number(f.actor))
  if (f.entity) q = q.eq('entity_id', Number(f.entity))
  if (f.vendor) q = q.eq('vendor_id', Number(f.vendor))
  if (f.category) q = q.eq('category', f.category)
  if (f.event) q = q.eq('event', f.event)
  // Free text: a PO number, invoice number, vendor or note. Characters that mean something inside a
  // PostgREST filter list are dropped rather than escaped.
  const text = f.text.trim().replace(/[,()*\\%]/g, ' ').trim()
  if (text) {
    q = q.or(['po_number', 'invoice_number', 'vendor_name', 'actor_name', 'note'].map((c) => `${c}.ilike.*${text}*`).join(','))
  }
  return q
}

function Details({ row, ctx }) {
  const lines = changeLines(row, ctx)
  const held = heldLines(row)
  return (
    <div>
      <div>{summarize(row, ctx)}</div>
      {(lines.length > 0 || held.length > 0) && (
        <details style={{ marginTop: 2 }}>
          <summary className="sub" style={{ cursor: 'pointer', margin: 0 }}>
            {lines.length > 0 ? `${lines.length} field${lines.length === 1 ? '' : 's'} recorded` : 'What it held'}
          </summary>
          <div style={{ marginTop: 4 }}>
            {lines.map((c) => (
              <div key={c.field}>
                {c.label}: {c.from !== null && c.to !== null ? (
                  <>
                    {c.from} → <strong>{c.to}</strong>
                  </>
                ) : (
                  c.to ?? c.from
                )}
              </div>
            ))}
            {held.map((h) => (
              <div key={h}>Held {h}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// `focus` ({ id, label }) narrows it to one PO; `onSelectPo({ id, label, open })` either focuses a PO
// here (open false) or jumps to it on the Purchase Orders tab (open true).
function PoHistoryTab({ users, projects, vendors, purchaseRequests, focus, onClearFocus, onSelectPo }) {
  const [draft, setDraft] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [verify, setVerify] = useState(null)
  const [exporting, setExporting] = useState(null)
  const focusId = focus?.id || null
  const ctx = useMemo(() => ({ users, projects, vendors }), [users, projects, vendors])

  // Typing waits a moment before it queries; the dropdowns and dates apply at once too, through here.
  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), 350)
    return () => clearTimeout(t)
  }, [draft])

  const load = useCallback(
    async (from) => {
      setLoading(true)
      const { data, error: loadError, count } = await applyFilters(
        supabase.from('po_history').select('*', { count: 'exact' }).order('seq', { ascending: false }),
        applied,
        focusId
      ).range(from, from + PAGE - 1)
      if (loadError) {
        console.error(loadError)
        setError(
          /po_history|permission|policy/i.test(loadError.message || '')
            ? "The PO history isn't set up yet, or you don't have access to it. Run supabase/add_po_history.sql in the Inventory project's SQL editor first."
            : 'Could not load the PO history — check the console for details.'
        )
      } else {
        setError(null)
        setRows((prev) => (from === 0 ? data : [...prev, ...data]))
        setTotal(count)
      }
      setLoading(false)
    },
    [applied, focusId]
  )

  useEffect(() => {
    load(0)
  }, [load])

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))
  const filtered = Object.values(applied).some(Boolean) || Boolean(focusId)

  const events = Object.entries(PO_HISTORY_EVENTS)
  const poExists = (id) => id && purchaseRequests.some((r) => r.id === id)

  async function runVerify() {
    setVerify({ busy: true })
    const { data, error: verifyError } = await supabase.rpc('fn_verify_po_history')
    if (verifyError) {
      console.error(verifyError)
      setVerify({ error: verifyError.message || 'Could not verify the history.' })
    } else {
      setVerify({ result: data, at: new Date() })
    }
  }

  async function exportCsv() {
    setExporting(0)
    try {
      const all = []
      for (let from = 0; from < EXPORT_LIMIT; from += EXPORT_PAGE) {
        const { data, error: exportError } = await applyFilters(
          supabase.from('po_history').select('*').order('seq', { ascending: false }),
          applied,
          focusId
        ).range(from, from + EXPORT_PAGE - 1)
        if (exportError) throw exportError
        all.push(...data)
        setExporting(all.length)
        if (data.length < EXPORT_PAGE) break
      }
      downloadCsv(`po-history-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(all.map((r) => historyCsvRow(r, ctx))))
    } catch (exportError) {
      console.error(exportError)
      setError('Could not export the history — check the console for details.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          PO History{' '}
          {total !== null && !error && (
            <span className="sub">
              — {total.toLocaleString()} record{total === 1 ? '' : 's'}
              {filtered ? ' match' : ''}
            </span>
          )}
        </h2>
        <div className="header-actions">
          <button className="btn-secondary" onClick={runVerify} disabled={verify?.busy}>
            {verify?.busy ? 'Verifying…' : 'Verify integrity'}
          </button>
          <button className="btn-secondary" onClick={exportCsv} disabled={exporting !== null || rows.length === 0}>
            {exporting !== null ? `Exporting… ${exporting.toLocaleString()}` : 'Export CSV'}
          </button>
        </div>
      </div>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        Every step in a PO's life — who did what, and when. Recorded by the database itself and cannot be edited or deleted.
      </p>

      {verify && !verify.busy && (
        <div className={'status ' + (verify.result?.ok ? 'ok' : 'err')} style={{ marginBottom: 8 }}>
          {verify.error
            ? verify.error
            : verify.result.ok
            ? `✓ Integrity verified ${verify.at.toLocaleString()}: all ${verify.result.checked.toLocaleString()} records are intact and in unbroken order.`
            : `⚠ The record chain is broken at record ${verify.result.bad_seq}: ${verify.result.reason} ${verify.result.checked.toLocaleString()} earlier records were fine. Tell an administrator immediately.`}
        </div>
      )}

      {focusId && (
        <div className="status ok" style={{ marginBottom: 8 }}>
          Showing only {focus.label}.{' '}
          <button type="button" className="inv-undo" onClick={onClearFocus}>
            Show all POs
          </button>
        </div>
      )}

      <div className="edit-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input
          type="text"
          placeholder="PO #, invoice #, vendor, person, note…"
          value={draft.text}
          onChange={set('text')}
          style={{ width: 250 }}
          aria-label="Search"
        />
        <select value={draft.actor} onChange={set('actor')} aria-label="Who">
          <option value="">Everyone</option>
          <option value="system">System (no user)</option>
          {[...users]
            .filter((u) => !u.vendor_id)
            .sort((a, b) => (a.display_name || a.name || '').localeCompare(b.display_name || b.name || ''))
            .map((u) => (
              <option value={u.id} key={u.id}>
                {u.display_name || u.name}
              </option>
            ))}
        </select>
        <select value={draft.entity} onChange={set('entity')} aria-label="Entity">
          <option value="">All entities</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={draft.vendor} onChange={set('vendor')} aria-label="Vendor">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option value={v.id} key={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value, event: '' }))}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {Object.entries(PO_HISTORY_CATEGORIES).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={draft.event} onChange={set('event')} aria-label="Event">
          <option value="">All events</option>
          {events.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="po-date-filter">
          From
          <input type="date" value={draft.from} max={draft.to || undefined} onChange={set('from')} />
        </label>
        <label className="po-date-filter">
          To
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={set('to')} />
        </label>
        {Object.values(draft).some(Boolean) && (
          <button type="button" className="btn-secondary" onClick={() => setDraft(EMPTY)}>
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="status err">{error}</div>}

      {!error && loading && rows.length === 0 ? (
        <div className="empty">Loading…</div>
      ) : !error && rows.length === 0 ? (
        <div className="empty">{filtered ? 'No records match the filters.' : 'No history recorded yet.'}</div>
      ) : (
        !error && (
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col style={{ width: '160px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '190px' }} />
                <col />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th>When</th>
                  <th>Who</th>
                  <th>Event</th>
                  <th>PO</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap-cell">{new Date(r.happened_at).toLocaleString()}</td>
                    <td>{r.actor_name || 'System'}</td>
                    <td>
                      {eventLabel(r.event)}
                      <div className="sub" style={{ margin: 0 }}>
                        {PO_HISTORY_CATEGORIES[r.category] || r.category}
                      </div>
                    </td>
                    <td>
                      {r.purchase_request_id ? (
                        <>
                          <button
                            type="button"
                            className="inv-undo"
                            style={{ fontSize: 13 }}
                            title="Show only this PO's history"
                            onClick={() => onSelectPo({ id: r.purchase_request_id, label: poLabelOf(r), open: false })}
                          >
                            {poLabelOf(r)}
                          </button>
                          {poExists(r.purchase_request_id) && (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="inv-undo"
                                title="Open this PO"
                                onClick={() => onSelectPo({ id: r.purchase_request_id, label: poLabelOf(r), open: true })}
                              >
                                open ↗
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                      <div className="sub" style={{ margin: 0 }}>
                        {[r.entity_name, r.vendor_name].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td>
                      <Details row={r} ctx={ctx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!error && total !== null && rows.length < total && (
        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button className="btn-secondary" disabled={loading} onClick={() => load(rows.length)}>
            {loading ? 'Loading…' : `Load older records (${rows.length.toLocaleString()} of ${total.toLocaleString()} shown)`}
          </button>
        </div>
      )}
    </div>
  )
}

export default PoHistoryTab
