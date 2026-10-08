import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import { shortProjectName } from '../utils'
import {
  BARN, STORAGE, allLocationKeys, downloadCsv, locLabel, offSiteUnits, parseLocKey, qtyAt, rpcErrorText, siteKey,
} from '../stockUtils'

// Where every part physically sits: Storage, the Barn, or on an entity's own site.
// A site can only hold parts that entity owns, so moving a part between sites means
// transferring ownership first (Stock Transfer on the Ownership tab, which moves them
// together). Update Location moves units between places; Record Part Use takes units out.
function PhysicalLocationTab({
  canEdit,
  projects,
  parts,
  users,
  stockItems,
  stockLoading,
  loadError,
  reloadStock,
  focusGcsId,
  onFocusDone,
  onShowOwnership,
}) {
  const [view, setView] = useState('places')
  const [mode, setMode] = useState(null) // null | 'move' | 'use'
  const [status, setStatus] = useState(null)
  const [gcsFilter, setGcsFilter] = useState('')
  const [placeFilter, setPlaceFilter] = useState('')
  const [note, setNote] = useState('')
  const [moves, setMoves] = useState({}) // gcs -> { from, to, qty }
  const [uses, setUses] = useState({}) // gcs -> { from, owner, qty }
  const [busy, setBusy] = useState(null)

  function flash(msg, ok) {
    setStatus({ ok, msg })
    setTimeout(() => setStatus(null), ok ? 3500 : 9000)
  }

  const keys = useMemo(() => allLocationKeys(projects), [projects])
  const placeCols = keys // Storage, Barn, then each site
  const label = (k) => locLabel(k, projects)

  const items = useMemo(() => {
    let list = stockItems
    if (placeFilter) list = list.filter((i) => qtyAt(i, placeFilter) > 0)
    if (gcsFilter) list = list.filter((i) => String(i.gcs_id) === gcsFilter)
    return list
  }, [stockItems, placeFilter, gcsFilter])
  const gcsOptions = useMemo(() => stockItems.map((i) => i.gcs_id).sort((a, b) => a - b), [stockItems])

  useEffect(() => {
    if (focusGcsId === null || focusGcsId === undefined || stockLoading) return undefined
    document.getElementById(`loc-row-${focusGcsId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => onFocusDone?.(), 2600)
    return () => clearTimeout(t)
  }, [focusGcsId, stockLoading, onFocusDone])

  function showView(next) {
    setMode(null)
    setStatus(null)
    setView(next)
  }
  function startMode(next) {
    setView('places')
    setMoves({})
    setUses({})
    setNote('')
    setMode(mode === next ? null : next)
  }

  const occupied = (item) => keys.filter((k) => qtyAt(item, k) > 0)

  // ---- Update Location ----
  function moveState(item) {
    const from = occupied(item)
    const m = moves[item.gcs_id] || {}
    const fromKey = m.from && from.includes(m.from) ? m.from : from.length === 1 ? from[0] : ''
    return { from, fromKey, toKey: m.to || '', qty: m.qty ?? '' }
  }
  function setMove(gcs, patch) {
    setMoves((prev) => ({ ...prev, [gcs]: { ...(prev[gcs] || {}), ...patch } }))
  }
  function toOptionState(item, fromKey, k) {
    if (k === fromKey) return { disabled: true, why: '' }
    const { location, projectId } = parseLocKey(k)
    if (location === 'site') {
      if (fromKey.startsWith('site:')) return { disabled: true, why: ' (transfer ownership first)' }
      if (offSiteUnits(item, projectId) <= 0) return { disabled: true, why: ' (owns none off-site)' }
    }
    return { disabled: false, why: '' }
  }
  async function doMove(item) {
    const { fromKey, toKey, qty } = moveState(item)
    const q = Number(qty)
    if (!note.trim()) return flash('A reason is required before saving.', false)
    if (!fromKey || !toKey) return flash('Choose where the units are now and where they are going.', false)
    if (!q || q <= 0) return flash('Enter a quantity greater than zero.', false)
    const f = parseLocKey(fromKey), t = parseLocKey(toKey)
    setBusy(item.gcs_id)
    const { error } = await supabase.rpc('fn_move_location', {
      p_part: item.gcs_id, p_from_loc: f.location, p_from_project: f.projectId,
      p_to_loc: t.location, p_to_project: t.projectId, p_qty: q, p_note: note.trim(),
    })
    setBusy(null)
    if (error) {
      console.error(error)
      return flash(rpcErrorText(error, 'Could not move the units.'), false)
    }
    setMoves((prev) => ({ ...prev, [item.gcs_id]: {} }))
    flash('Location updated.', true)
    await reloadStock()
  }

  // ---- Record Part Use ----
  function usageRow(item) {
    const from = occupied(item)
    const u = uses[item.gcs_id] || {}
    const fromKey = u.from && from.includes(u.from) ? u.from : from.length === 1 ? from[0] : ''
    const fromLoc = fromKey ? parseLocKey(fromKey) : null
    let owners = []
    if (fromLoc && fromLoc.location !== 'site') {
      owners = projects.filter((p) => offSiteUnits(item, p.id) > 0)
    }
    const owner = fromLoc?.location === 'site' ? fromLoc.projectId : u.owner && owners.some((o) => String(o.id) === String(u.owner)) ? u.owner : owners.length === 1 ? owners[0].id : ''
    return { from, fromKey, fromLoc, owners, owner, qty: u.qty ?? '' }
  }
  function setUse(gcs, patch) {
    setUses((prev) => ({ ...prev, [gcs]: { ...(prev[gcs] || {}), ...patch } }))
  }
  async function doUse(item) {
    const { fromLoc, owner, qty } = usageRow(item)
    const q = Number(qty)
    if (!note.trim()) return flash('A reason is required before saving.', false)
    if (!fromLoc) return flash('Choose where the units were used from.', false)
    if (!owner) return flash('Choose whose count this comes from.', false)
    if (!q || q <= 0) return flash('Enter a quantity greater than zero.', false)
    setBusy(item.gcs_id)
    const { error } = await supabase.rpc('fn_record_use', {
      p_part: item.gcs_id, p_location: fromLoc.location, p_owner: Number(owner), p_qty: q, p_note: note.trim(),
    })
    setBusy(null)
    if (error) {
      console.error(error)
      return flash(rpcErrorText(error, 'Could not record the use.'), false)
    }
    setUses((prev) => ({ ...prev, [item.gcs_id]: {} }))
    flash('Part use recorded.', true)
    await reloadStock()
  }

  // ---- export ----
  // Exports what the Location dropdown is set to: one place (Storage, the Barn, or an entity's
  // own site), or every place when it's on "All locations". Only that place's rows are written.
  function exportCsv() {
    const date = new Date().toISOString().slice(0, 10)
    const exportKeys = placeFilter ? [placeFilter] : keys
    const rows = []
    for (const item of items) {
      for (const k of exportKeys) {
        const q = qtyAt(item, k)
        if (q > 0) {
          rows.push({
            'GCS P/N': item.gcs_id,
            'Part ID': item.part?.gcs_part_id || '',
            Description: item.part?.description || '',
            Location: label(k),
            Quantity: q,
          })
        }
      }
    }
    const slug = placeFilter ? '-' + label(placeFilter).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''
    downloadCsv(`physical-locations${slug}-${date}.csv`, Papa.unparse(rows))
  }

  const extraCols = mode === 'move' ? 4 : mode === 'use' ? 4 : 0
  const baseCols = 2 + placeCols.length + 1

  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          <button className={view === 'places' && !mode ? 'btn-primary' : 'btn-secondary'} onClick={() => showView('places')}>
            Physical Location
          </button>
          {canEdit && (
            <>
              <button className={mode === 'move' ? 'btn-primary' : 'btn-secondary'} onClick={() => startMode('move')}>
                Update Location
              </button>
              <button className={mode === 'use' ? 'btn-primary' : 'btn-secondary'} onClick={() => startMode('use')}>
                Record Part Use
              </button>
            </>
          )}
        </div>
        {mode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <input type="text" placeholder={mode === 'move' ? 'Reason for this move (required)' : 'Reason for this use (required)'} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-secondary" onClick={() => startMode(mode)}>Done</button>
          </div>
        )}
        {(status || loadError) && <div className={'status ' + (status && status.ok ? 'ok' : 'err')}>{status ? status.msg : loadError}</div>}
      </div>

      {view === 'places' && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <h2>
                {mode === 'move' ? 'Update Location' : mode === 'use' ? 'Record Part Use' : 'Physical Location'} {stockLoading ? '' : `(${items.length})`}
              </h2>
              <div className="project-select-wrap" style={{ maxWidth: 280, flex: 'none' }}>
                <select value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} title="Show only the parts that have units in this place">
                  <option value="">All locations</option>
                  {keys.map((k) => <option value={k} key={k}>{label(k)}</option>)}
                </select>
              </div>
              {!mode && (
                <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={exportCsv} disabled={stockLoading || items.length === 0}
                  title={placeFilter ? `Export only what is in ${label(placeFilter)}` : 'Export every location'}>
                  {placeFilter ? `Export CSV (${label(placeFilter)})` : 'Export CSV'}
                </button>
              )}
            </div>
            {!mode && (
              <p className="sub" style={{ margin: 0 }}>
                Where each part physically is. A site can only hold parts that entity owns. Click a part to see who owns it.
              </p>
            )}
            {mode === 'move' && (
              <p className="sub" style={{ margin: 0 }}>
                Move units between places. Ownership doesn&apos;t change, and a site can only receive units its entity owns. To move parts from one site to another, use Stock Transfer on the Ownership tab, which changes the owner and the location together.
              </p>
            )}
            {mode === 'use' && (
              <p className="sub" style={{ margin: 0 }}>
                Take units out where they were used. On a site, the count that goes down is that site&apos;s entity. From Storage or the Barn, choose whose count it comes from.
              </p>
            )}
          </div>

          {stockLoading ? (
            <div className="empty">Loading...</div>
          ) : (
            <div className="sheet-wrap">
              <table className="sheet" style={{ minWidth: 70 + 180 + placeCols.length * 78 + 80 + (extraCols ? 70 + 520 : 0) }}>
                <colgroup>
                  <col className="col-rowhead" style={{ width: '70px' }} />
                  <col style={{ width: '180px' }} />
                  {placeCols.map((k) => <col key={k} style={{ width: `${70 / placeCols.length}%` }} />)}
                  <col style={{ width: '6%' }} />
                  {mode === 'move' && (<><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '5%' }} /><col style={{ width: '6%' }} /></>)}
                  {mode === 'use' && (<><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '5%' }} /><col style={{ width: '6%' }} /></>)}
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th className="row-head">GCS P/N</th>
                    <th>Description</th>
                    {placeCols.map((k) => (
                      <th key={k} className="center-cell" title={label(k)} style={placeFilter === k ? { background: '#dbeafe' } : undefined}>
                        {k === STORAGE ? 'Storage' : k === BARN ? 'Barn' : shortProjectName(projects.find((p) => siteKey(p.id) === k)?.name || '')}
                      </th>
                    ))}
                    <th className="center-cell total-col">Total</th>
                    {mode === 'move' && (<><th className="center-cell">From</th><th className="center-cell">To</th><th className="center-cell">Qty</th><th className="center-cell"></th></>)}
                    {mode === 'use' && (<><th className="center-cell">Used from</th><th className="center-cell">Whose count</th><th className="center-cell">Qty</th><th className="center-cell"></th></>)}
                  </tr>
                  <tr className="filter-row">
                    <th className="row-head">
                      <select value={gcsFilter} onChange={(e) => setGcsFilter(e.target.value)}>
                        <option value="">All</option>
                        {gcsOptions.map((id) => <option value={id} key={id}>{id}</option>)}
                      </select>
                    </th>
                    <th colSpan={baseCols - 1 + extraCols}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={baseCols + extraCols}>
                        {gcsFilter || placeFilter ? 'No parts match your filter.' : 'No parts yet.'}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const total = keys.reduce((s, k) => s + qtyAt(item, k), 0)
                      const clickable = !mode
                      const mv = mode === 'move' ? moveState(item) : null
                      const us = mode === 'use' ? usageRow(item) : null
                      return (
                        <tr key={item.gcs_id} id={`loc-row-${item.gcs_id}`}
                          className={[clickable ? 'row-link' : '', focusGcsId === item.gcs_id ? 'row-focus' : ''].filter(Boolean).join(' ') || undefined}
                          onClick={clickable ? () => onShowOwnership?.(item.gcs_id) : undefined}
                          onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onShowOwnership?.(item.gcs_id) } : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          title={clickable ? 'Show who owns this part' : undefined}>
                          <td className="row-head">{item.gcs_id}</td>
                          <td>{item.part?.description || '—'}</td>
                          {placeCols.map((k) => {
                            const q = qtyAt(item, k)
                            return (
                              <td key={k} className="center-cell" style={placeFilter === k && q > 0 ? { background: '#dbeafe' } : undefined}>
                                {q > 0 ? q : '—'}
                              </td>
                            )
                          })}
                          <td className="center-cell total-col">{total}</td>
                          {mode === 'move' && (
                            <>
                              <td className="center-cell">
                                <select value={mv.fromKey} onChange={(e) => setMove(item.gcs_id, { from: e.target.value, to: '' })}>
                                  <option value="">{mv.from.length ? 'Choose…' : 'No units'}</option>
                                  {mv.from.map((k) => <option value={k} key={k}>{label(k)} ({qtyAt(item, k)})</option>)}
                                </select>
                              </td>
                              <td className="center-cell">
                                <select value={mv.toKey} disabled={!mv.fromKey} onChange={(e) => setMove(item.gcs_id, { to: e.target.value })}>
                                  <option value="">Choose…</option>
                                  {keys.map((k) => {
                                    const s = toOptionState(item, mv.fromKey, k)
                                    return <option value={k} key={k} disabled={s.disabled}>{label(k)}{s.why}</option>
                                  })}
                                </select>
                              </td>
                              <td className="center-cell">
                                <input type="number" min="0" value={mv.qty} onChange={(e) => setMove(item.gcs_id, { qty: e.target.value })} />
                              </td>
                              <td className="center-cell">
                                <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => doMove(item)}
                                  disabled={busy === item.gcs_id || !note.trim() || !mv.fromKey || !mv.toKey || !mv.qty}>
                                  {busy === item.gcs_id ? 'Saving…' : 'Move'}
                                </button>
                              </td>
                            </>
                          )}
                          {mode === 'use' && (
                            <>
                              <td className="center-cell">
                                <select value={us.fromKey} onChange={(e) => setUse(item.gcs_id, { from: e.target.value, owner: '' })}>
                                  <option value="">{us.from.length ? 'Choose…' : 'No units'}</option>
                                  {us.from.map((k) => <option value={k} key={k}>{label(k)} ({qtyAt(item, k)})</option>)}
                                </select>
                              </td>
                              <td className="center-cell">
                                {us.fromLoc?.location === 'site' ? (
                                  <span className="sub" style={{ margin: 0 }}>{shortProjectName(projects.find((p) => p.id === us.fromLoc.projectId)?.name || '')}</span>
                                ) : us.fromLoc ? (
                                  <select value={us.owner} onChange={(e) => setUse(item.gcs_id, { owner: e.target.value })}>
                                    <option value="">{us.owners.length ? 'Choose…' : 'No owner has units here'}</option>
                                    {us.owners.map((p) => <option value={p.id} key={p.id}>{shortProjectName(p.name)} ({offSiteUnits(item, p.id)})</option>)}
                                  </select>
                                ) : '—'}
                              </td>
                              <td className="center-cell">
                                <input type="number" min="0" value={us.qty} onChange={(e) => setUse(item.gcs_id, { qty: e.target.value })} />
                              </td>
                              <td className="center-cell">
                                <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => doUse(item)}
                                  disabled={busy === item.gcs_id || !note.trim() || !us.fromKey || !us.owner || !us.qty}>
                                  {busy === item.gcs_id ? 'Saving…' : 'Record Use'}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default PhysicalLocationTab
