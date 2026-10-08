import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

// Change history for the Master List: one row per add / edit / delete of a part, with who made
// it and exactly which fields changed. Written by a database trigger (supabase/add_parts_history.sql),
// so it covers every way a part can change, and it can't be edited from here.

const PAGE = 500

const FIELD_LABELS = {
  gcs_part_id: 'Part ID',
  manufacturer_part_number: 'Mfr Part #',
  manufacturer: 'Manufacturer',
  spare_category: 'Category',
  description: 'Description',
  last_cost: 'Last Cost',
  image_url: 'Picture',
  primary_location: 'Primary location',
  common_spare_part: 'Common spare',
  max_stock: 'Max stock',
  min_stock: 'Min stock',
  storage_qty: 'Storage qty',
  barn_qty: 'Barn qty',
}
const fieldLabel = (k) => FIELD_LABELS[k] || k

function showValue(field, v) {
  if (v === null || v === undefined || v === '') return '(blank)'
  if (field === 'image_url') return 'a picture'
  if (field === 'last_cost') return '$' + Number(v).toFixed(2)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

const ACTION_LABELS = { insert: 'Added', update: 'Edited', delete: 'Deleted' }
const changedAt = (row) => row.changed_at

function ChangeLines({ row }) {
  const entries = Object.entries(row.changes || {}).sort(([a], [b]) => fieldLabel(a).localeCompare(fieldLabel(b)))
  return (
    <div>
      {entries.map(([field, c]) => {
        const label = fieldLabel(field)
        if (row.action === 'update') {
          if (field === 'image_url') {
            return <div key={field}>{label}: {c.new ? (c.old ? 'changed' : 'added') : 'removed'}</div>
          }
          return (
            <div key={field}>
              {label}: {showValue(field, c.old)} → <strong>{showValue(field, c.new)}</strong>
            </div>
          )
        }
        const v = row.action === 'insert' ? c.new : c.old
        return (
          <div key={field}>
            {label}: {field === 'image_url' ? 'picture' : showValue(field, v)}
          </div>
        )
      })}
    </div>
  )
}

function PartsHistoryPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [partFilter, setPartFilter] = useState('')
  const [whoFilter, setWhoFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  async function loadMore(from) {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('parts_history')
      .select('*')
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (loadError) {
      console.error(loadError)
      setError(
        /parts_history/i.test(loadError.message || '')
          ? "Change history isn't set up yet. Run supabase/add_parts_history.sql in the Inventory project's SQL editor first."
          : 'Could not load the change history — check the console for details.'
      )
    } else {
      setError(null)
      setRows((prev) => (from === 0 ? data : [...prev, ...data]))
      setHasMore((data || []).length === PAGE)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMore(0)
  }, [])

  const people = useMemo(() => [...new Set(rows.map((r) => r.changed_by_name || ''))].sort(), [rows])

  const matching = useMemo(() => {
    const q = partFilter.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!q || String(r.part_gcs_id) === q || (r.gcs_part_id || '').toLowerCase().includes(q)) &&
        (whoFilter === '' || (r.changed_by_name || '') === (whoFilter === '__system' ? '' : whoFilter)) &&
        (!actionFilter || r.action === actionFilter)
    )
  }, [rows, partFilter, whoFilter, actionFilter])

  const range = useDateRange(matching, changedAt)

  return (
    <div className="card">
      <div className="card-header">
        <h2>Master List Change History {loading && rows.length === 0 ? '' : `(${range.listed.length})`}</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="GCS P/N or Part ID…"
            value={partFilter}
            onChange={(e) => setPartFilter(e.target.value)}
            style={{ width: 160 }}
          />
          <select value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option value={p === '' ? '__system' : p} key={p || '__system'}>
                {p || 'System'}
              </option>
            ))}
          </select>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All changes</option>
            <option value="update">Edited</option>
            <option value="insert">Added</option>
            <option value="delete">Deleted</option>
          </select>
          <DateRangeFilter range={range} what="changed" />
        </div>
      </div>

      {error && <div className="status err">{error}</div>}

      {!error && loading && rows.length === 0 ? (
        <div className="empty">Loading...</div>
      ) : !error && range.listed.length === 0 ? (
        <div className="empty">{rows.length === 0 ? 'No changes recorded yet.' : 'No changes match the filters.'}</div>
      ) : (
        !error && (
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col style={{ width: '170px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '190px' }} />
                <col />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <DateSortHeader range={range} label="When" />
                  <th>Who</th>
                  <th>Change</th>
                  <th>Part</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {range.listed.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap-cell">{new Date(r.changed_at).toLocaleString()}</td>
                    <td>{r.changed_by_name || 'System'}</td>
                    <td>{ACTION_LABELS[r.action] || r.action}</td>
                    <td>
                      {r.part_gcs_id}
                      {r.gcs_part_id ? ` · ${r.gcs_part_id}` : ''}
                    </td>
                    <td>
                      <ChangeLines row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!error && hasMore && (
        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button className="btn-secondary" disabled={loading} onClick={() => loadMore(rows.length)}>
            {loading ? 'Loading…' : 'Load older changes'}
          </button>
        </div>
      )}
    </div>
  )
}

export default PartsHistoryPanel
