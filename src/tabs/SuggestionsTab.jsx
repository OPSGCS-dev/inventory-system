import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import { downloadCsv } from '../stockUtils'
import { formatDateTime } from '../utils'

// The Suggestions tab. Anyone signed in can send in something they dislike, something that's broken, or an idea
// (add_suggestions.sql); the admin sees everyone's in a list, sorts them out by status and can reply. Everyone else
// sees only their own suggestions and any reply. Who sent it and when is filled in by the database.

const SUGGESTION_PAGES = [
  'Master List',
  'Required Inventory',
  'Inventory On Hand',
  'Purchase Orders',
  'PO History',
  'Audit',
  'PO Ledger',
  'Admin',
  'The whole site / not sure',
]

const KINDS = {
  broken: 'Something is broken',
  dislike: "Something I don't like",
  idea: 'An idea or missing feature',
  other: 'Other',
}

const SUGGESTION_STATUSES = {
  new: 'New',
  reviewing: 'Looking at it',
  planned: 'Planned',
  done: 'Done',
  declined: "Won't do",
}
const OPEN_STATUSES = ['new', 'reviewing', 'planned']
const MAX_LEN = 4000

const when = (iso) => (iso ? formatDateTime(iso) : '')

// A missing table means add_suggestions.sql hasn't been run yet.
const isMissingTable = (error) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  (/suggestions/i.test(error?.message || '') && /does not exist|schema cache|Could not find/i.test(error?.message || ''))

function SuggestionsTab({ isAdmin, defaultPage, onChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ kind: 'dislike', page: defaultPage || '', body: '' })
  const [sending, setSending] = useState(false)
  const [statusFilter, setStatusFilter] = useState('open')
  const [kindFilter, setKindFilter] = useState('')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState({}) // id -> reply being typed (admin)
  const [busyId, setBusyId] = useState(null)

  function flash(msg, ok) {
    setStatus({ ok, msg })
    setTimeout(() => setStatus(null), ok ? 3500 : 8000)
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('suggestions').select('*').order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      console.error(error)
      if (isMissingTable(error)) setSetupNeeded(true)
      else flash('Could not load the suggestions — check the console for details.', false)
      return
    }
    setSetupNeeded(false)
    setItems(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function submit() {
    const body = form.body.trim()
    if (body.length < 3) return flash('Write a few words about what you would like changed.', false)
    setSending(true)
    const { error } = await supabase.from('suggestions').insert({ kind: form.kind, page: form.page || null, body })
    setSending(false)
    if (error) {
      console.error(error)
      return flash(isMissingTable(error) ? "Suggestions aren't set up yet — run add_suggestions.sql." : 'Could not send it — check the console for details.', false)
    }
    setForm((f) => ({ ...f, body: '' }))
    flash('Thank you — your suggestion has been sent.', true)
    await load()
    onChanged?.()
  }

  async function update(id, patch, done) {
    setBusyId(id)
    const { data, error } = await supabase.from('suggestions').update(patch).eq('id', id).select()
    setBusyId(null)
    if (error || !data || data.length === 0) {
      console.error(error)
      return flash('Could not save that — check the console for details.', false)
    }
    setItems((prev) => prev.map((s) => (s.id === id ? data[0] : s)))
    if (done) done()
    onChanged?.()
  }

  async function remove(s) {
    if (!window.confirm('Delete this suggestion? This cannot be undone.')) return
    setBusyId(s.id)
    const { error } = await supabase.from('suggestions').delete().eq('id', s.id)
    setBusyId(null)
    if (error) {
      console.error(error)
      return flash('Could not delete it — check the console for details.', false)
    }
    setItems((prev) => prev.filter((x) => x.id !== s.id))
    onChanged?.()
  }

  const counts = useMemo(() => {
    const c = { all: items.length, open: 0 }
    for (const k of Object.keys(SUGGESTION_STATUSES)) c[k] = 0
    for (const s of items) {
      c[s.status] = (c[s.status] || 0) + 1
      if (OPEN_STATUSES.includes(s.status)) c.open++
    }
    return c
  }, [items])

  const shown = items.filter((s) => {
    if (!isAdmin) return true // the filters are the admin's; everyone else sees all of their own
    if (statusFilter === 'open' && !OPEN_STATUSES.includes(s.status)) return false
    if (statusFilter && statusFilter !== 'open' && statusFilter !== 'all' && s.status !== statusFilter) return false
    if (kindFilter && s.kind !== kindFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (![s.body, s.user_name, s.page, s.admin_note].some((v) => (v || '').toLowerCase().includes(q))) return false
    }
    return true
  })

  function exportCsv() {
    const csv = Papa.unparse(
      shown.map((s) => ({
        Date: when(s.created_at),
        From: s.user_name || '',
        Page: s.page || '',
        Type: KINDS[s.kind] || s.kind,
        Suggestion: s.body,
        Status: SUGGESTION_STATUSES[s.status] || s.status,
        Reply: s.admin_note || '',
      }))
    )
    downloadCsv(`suggestions-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Send a suggestion</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Found something you dislike, something broken, or have an idea? Tell us here. Say what you were trying to do and what got in the way, or what
              would make it better.
            </p>
          </div>
        </div>
        {setupNeeded ? (
          <div className="status err">Suggestions aren&apos;t set up yet. Run supabase/add_suggestions.sql in the Inventory project&apos;s SQL editor.</div>
        ) : (
          <>
            <div className="field-row">
              <div>
                <label htmlFor="sg_kind">What kind of suggestion</label>
                <select id="sg_kind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  {Object.entries(KINDS).map(([k, label]) => (
                    <option value={k} key={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sg_page">Which page</label>
                <select id="sg_page" value={form.page} onChange={(e) => setForm((f) => ({ ...f, page: e.target.value }))}>
                  <option value="">Choose…</option>
                  {SUGGESTION_PAGES.map((p) => (
                    <option value={p} key={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label htmlFor="sg_body" style={{ marginTop: 10, display: 'block' }}>
              Your suggestion
            </label>
            <textarea
              id="sg_body"
              rows={5}
              maxLength={MAX_LEN}
              style={{ width: '100%', boxSizing: 'border-box', font: 'inherit' }}
              placeholder="What would you change?"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div className="edit-toolbar" style={{ marginTop: 8 }}>
              <button className="btn-primary" onClick={submit} disabled={sending || form.body.trim().length < 3}>
                {sending ? 'Sending…' : 'Send Suggestion'}
              </button>
              <span className="sub" style={{ margin: 0 }}>
                {form.body.length}/{MAX_LEN}. Your name is added automatically.
              </span>
            </div>
          </>
        )}
        {status && <div className={'status ' + (status.ok ? 'ok' : 'err')}>{status.msg}</div>}
      </div>

      {!setupNeeded && (
        <div className="card">
          <div className="card-header">
            <h2>{isAdmin ? `Suggestions (${shown.length})` : `Your suggestions (${items.length})`}</h2>
            {isAdmin && (
              <div className="header-actions">
                <button className="btn-secondary" onClick={exportCsv} disabled={shown.length === 0}>
                  Export CSV
                </button>
                <button className="btn-secondary" onClick={load} disabled={loading}>
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="edit-toolbar" style={{ flexWrap: 'wrap' }}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                <option value="open">Not finished ({counts.open})</option>
                <option value="all">All ({counts.all})</option>
                {Object.entries(SUGGESTION_STATUSES).map(([k, label]) => (
                  <option value={k} key={k}>
                    {label} ({counts[k] || 0})
                  </option>
                ))}
              </select>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Type">
                <option value="">All types</option>
                {Object.entries(KINDS).map(([k, label]) => (
                  <option value={k} key={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
            </div>
          )}

          {loading ? (
            <div className="empty">Loading...</div>
          ) : shown.length === 0 ? (
            <div className="empty">
              {items.length === 0
                ? isAdmin
                  ? 'No suggestions yet.'
                  : "You haven't sent any suggestions yet."
                : 'No suggestions match.'}
            </div>
          ) : isAdmin ? (
            <div className="sheet-wrap">
              <table className="sheet">
                <colgroup>
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '150px' }} />
                  <col />
                  <col style={{ width: '140px' }} />
                  <col style={{ width: '260px' }} />
                  <col style={{ width: '70px' }} />
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th>Sent</th>
                    <th>From</th>
                    <th>Page / type</th>
                    <th>Suggestion</th>
                    <th>Status</th>
                    <th>Your reply (the sender can see it)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const typed = notes[s.id]
                    const reply = typed !== undefined ? typed : s.admin_note || ''
                    const dirty = typed !== undefined && typed.trim() !== (s.admin_note || '')
                    return (
                      <tr key={s.id} style={s.status === 'new' ? { background: '#fffbe8' } : undefined}>
                        <td className="nowrap-cell">{when(s.created_at)}</td>
                        <td>{s.user_name || '—'}</td>
                        <td>
                          {s.page || '—'}
                          <div className="sub" style={{ margin: 0 }}>
                            {KINDS[s.kind] || s.kind}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{s.body}</td>
                        <td>
                          <select value={s.status} disabled={busyId === s.id} onChange={(e) => update(s.id, { status: e.target.value })}>
                            {Object.entries(SUGGESTION_STATUSES).map(([k, label]) => (
                              <option value={k} key={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <textarea
                            rows={2}
                            style={{ width: '100%', boxSizing: 'border-box', font: 'inherit' }}
                            value={reply}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          />
                          {dirty && (
                            <button
                              className="btn-secondary"
                              disabled={busyId === s.id}
                              onClick={() =>
                                update(s.id, { admin_note: typed.trim() || null }, () =>
                                  setNotes((prev) => {
                                    const n = { ...prev }
                                    delete n[s.id]
                                    return n
                                  })
                                )
                              }
                            >
                              Save reply
                            </button>
                          )}
                        </td>
                        <td>
                          <button className="del-btn" disabled={busyId === s.id} onClick={() => remove(s)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sheet-wrap">
              <table className="sheet">
                <colgroup>
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '170px' }} />
                  <col />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th>Sent</th>
                    <th>Page / type</th>
                    <th>Suggestion</th>
                    <th>Status</th>
                    <th>Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap-cell">{when(s.created_at)}</td>
                      <td>
                        {s.page || '—'}
                        <div className="sub" style={{ margin: 0 }}>
                          {KINDS[s.kind] || s.kind}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{s.body}</td>
                      <td>{SUGGESTION_STATUSES[s.status] || s.status}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{s.admin_note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default SuggestionsTab
