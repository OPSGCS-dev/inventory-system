import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { journalEntryTypeLabel, JOURNAL_ENTRY_TYPE_LABELS, findUserName } from '../utils'
import { locKeyOf, locLabel } from '../stockUtils'

// History of every change to what's owned and where it sits. Shared by the Ownership
// and Physical Location tabs. Loads its own data (most recent 200 entries); a line
// is either an ownership change (entity, before/after count) or a location change
// (place, before/after count). Older entries from before locations existed carry
// part-level Storage/Barn counts instead.
function HistoryPanel({ projects, parts, users }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [lines, setLines] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('inventory_journal')
      .select('*, inventory_journal_lines(count)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) {
      console.error(err)
      setError('Could not load history — check the console for details.')
    } else {
      setError(null)
      setEntries(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(id) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (lines[id]) return
    const { data, error: err } = await supabase
      .from('inventory_journal_lines')
      .select('*')
      .eq('journal_id', id)
      .order('id', { ascending: true })
    if (err) {
      console.error(err)
      return
    }
    setLines((prev) => ({ ...prev, [id]: data ?? [] }))
  }

  const shown = typeFilter ? entries.filter((j) => j.entry_type === typeFilter) : entries
  const partName = (gcsId) => parts.find((p) => p.gcs_id === gcsId)?.description || '—'

  function describeLine(line) {
    if (line.location) {
      return {
        what: `Location: ${locLabel(locKeyOf(line.location, line.location_project_id), projects)}`,
        before: line.previous_location_qty,
        after: line.new_location_qty,
      }
    }
    if (line.previous_storage_qty !== null && line.previous_storage_qty !== undefined) {
      return {
        what: 'Storage / Barn (older entry)',
        before: `S ${line.previous_storage_qty ?? '—'} · B ${line.previous_barn_qty ?? '—'}`,
        after: `S ${line.new_storage_qty ?? '—'} · B ${line.new_barn_qty ?? '—'}`,
      }
    }
    const owner = projects.find((p) => p.id === line.project_id)?.name || (line.project_id ? `Entity ${line.project_id}` : '—')
    return { what: `Owned by ${owner}`, before: line.previous_quantity, after: line.new_quantity }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>History {loading ? '' : `(${shown.length})`}</h2>
        <div className="header-actions">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(JOURNAL_ENTRY_TYPE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {error && <div className="status err">{error}</div>}
      {loading ? (
        <div className="empty">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="empty">{entries.length === 0 ? 'No changes logged yet.' : 'No entries of that type.'}</div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr className="header-row">
                <th className="row-head">Date</th>
                <th>Type</th>
                <th>Note</th>
                <th>By</th>
                <th className="center-cell"># Changed</th>
                <th className="center-cell"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => {
                const count = j.inventory_journal_lines?.[0]?.count ?? 0
                const open = expandedId === j.id
                return (
                  <Fragment key={j.id}>
                    <tr>
                      <td className="row-head">{new Date(j.created_at).toLocaleString()}</td>
                      <td>{journalEntryTypeLabel(j.entry_type)}</td>
                      <td>{j.note || '—'}</td>
                      <td>{j.created_by ? findUserName(users || [], j.created_by) : '—'}</td>
                      <td className="center-cell">{count}</td>
                      <td className="center-cell">
                        <button className="btn-secondary" onClick={() => toggle(j.id)}>
                          {open ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6}>
                          <table className="sheet">
                            <colgroup>
                              <col style={{ width: '26%' }} />
                              <col className="col-rowhead" />
                              <col />
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '14%' }} />
                            </colgroup>
                            <thead>
                              <tr className="header-row">
                                <th>What</th>
                                <th className="row-head">GCS P/N</th>
                                <th>Description</th>
                                <th className="center-cell">Before</th>
                                <th className="center-cell">After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(lines[j.id] ?? []).map((line) => {
                                const d = describeLine(line)
                                return (
                                  <tr key={line.id}>
                                    <td>{d.what}</td>
                                    <td className="row-head">{line.part_gcs_id}</td>
                                    <td>{partName(line.part_gcs_id)}</td>
                                    <td className="center-cell">{d.before ?? '—'}</td>
                                    <td className="center-cell">{d.after ?? '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default HistoryPanel
