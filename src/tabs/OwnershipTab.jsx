import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import { computeTargetSum, shortProjectName, normalizeHeader } from '../utils'
import { downloadCsv, offSiteUnits, ownedBy, rpcErrorText, totalOwned } from '../stockUtils'

const INCOMING_BG = '#fff3a8'

// Who owns how many of each part. Counts and uploads change ownership; Stock Transfer
// moves ownership between entities (and, in the same step, where the units are).
// Every change goes through a database function that applies the rules and writes History.
function OwnershipTab({
  canEdit,
  projects,
  parts,
  users,
  stockItems,
  stockLoading,
  loadError,
  incomingByKey,
  reloadStock,
  reloadPurchaseRequests,
  focusGcsId,
  onFocusDone,
  onShowLocation,
}) {
  const [view, setView] = useState('parts') // 'parts' | 'count'
  const [status, setStatus] = useState(null)
  const [entityFilter, setEntityFilter] = useState('all')
  const [gcsFilter, setGcsFilter] = useState('')

  // individual adjustment
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState([])
  const [editNote, setEditNote] = useState('')
  const [editSearch, setEditSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // stock transfer
  const [transferMode, setTransferMode] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [fromLoc, setFromLoc] = useState('') // '' = work it out
  const [toLoc, setToLoc] = useState('site')
  const [transferNote, setTransferNote] = useState('')
  const [qtyByPart, setQtyByPart] = useState({})
  const [busyPart, setBusyPart] = useState(null)

  // upload
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadErrors, setUploadErrors] = useState([])
  const [uploadNote, setUploadNote] = useState('')
  const [uploading, setUploading] = useState(false)

  function flash(msg, ok) {
    setStatus({ ok, msg })
    setTimeout(() => setStatus(null), ok ? 3500 : 9000)
  }

  const modeActive = editMode || transferMode
  const singleEntity = !modeActive && entityFilter !== 'all'
  const shownProjects = singleEntity ? projects.filter((p) => String(p.id) === String(entityFilter)) : projects

  const baseItems = useMemo(
    () => (singleEntity ? stockItems.filter((i) => Boolean(i.perProject[Number(entityFilter)])) : stockItems),
    [stockItems, singleEntity, entityFilter]
  )
  const visibleItems = useMemo(
    () => (gcsFilter ? baseItems.filter((i) => String(i.gcs_id) === gcsFilter) : baseItems),
    [baseItems, gcsFilter]
  )
  const gcsOptions = useMemo(() => [...new Set(baseItems.map((i) => i.gcs_id))].sort((a, b) => a - b), [baseItems])

  const visibleDraft = useMemo(() => {
    const q = editSearch.trim().toLowerCase()
    if (!q) return draft
    return draft.filter((r) =>
      [r.part?.gcs_part_id, r.part?.description].filter(Boolean).some((f) => String(f).toLowerCase().includes(q))
    )
  }, [draft, editSearch])

  // Units on issued POs that haven't been received yet: counted, shown in yellow.
  const incomingAt = (pid, gcs) => {
    if (modeActive) return null
    const e = incomingByKey?.get(`${pid}:${gcs}`)
    return e && e.qty > 0 ? e : null
  }
  const incomingAcross = (item) => {
    let qty = 0
    const pos = []
    for (const pid of Object.keys(item.perProject)) {
      const e = incomingAt(pid, item.gcs_id)
      if (!e) continue
      qty += e.qty
      for (const po of e.pos) pos.push(po)
    }
    return { qty, pos }
  }
  const incomingTitle = (pos) =>
    `Includes ${pos.map((p) => `${p.qty} on ${p.label}`).join(', ')} — issued but not received yet, so not on the shelf`

  // Reflect a focus request from the other tab: scroll to the row and flash it.
  useEffect(() => {
    if (focusGcsId === null || focusGcsId === undefined || stockLoading) return undefined
    document.getElementById(`own-row-${focusGcsId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => onFocusDone?.(), 2600)
    return () => clearTimeout(t)
  }, [focusGcsId, stockLoading, onFocusDone])

  // ------- switching modes -------
  function hasUnsavedEdits() {
    return draft.some((row) =>
      Object.entries(row.qtyByProject).some(([pid, v]) => (v === '' ? 0 : Number(v)) !== ownedBy(stockItems.find((i) => i.gcs_id === row.gcs_id), Number(pid)))
    )
  }
  function leaveModes() {
    if (editMode && hasUnsavedEdits() && !window.confirm('Discard your unsaved changes?')) return false
    setEditMode(false)
    setDraft([])
    setTransferMode(false)
    setQtyByPart({})
    return true
  }
  function showView(next) {
    if (!leaveModes()) return
    setStatus(null)
    setView(next)
  }

  function startEdit() {
    if (!leaveModes()) return
    setDraft(
      stockItems.map((item) => ({
        gcs_id: item.gcs_id,
        part: item.part,
        perProject: item.perProject,
        qtyByProject: Object.fromEntries(Object.entries(item.perProject).map(([pid, p]) => [pid, String(p.onHand ?? 0)])),
      }))
    )
    setEditSearch('')
    setEditNote('')
    setEntityFilter('all')
    setView('parts')
    setEditMode(true)
  }
  function startTransfer() {
    if (!leaveModes()) return
    setFromId(projects[0] ? String(projects[0].id) : '')
    setToId('')
    setFromLoc('')
    setToLoc('site')
    setTransferNote('')
    setQtyByPart({})
    setEntityFilter('all')
    setView('parts')
    setTransferMode(true)
  }

  // ------- individual adjustment -------
  async function saveEdits() {
    if (!editNote.trim()) return flash('A reason is required before saving.', false)
    const rows = []
    for (const row of draft) {
      const item = stockItems.find((i) => i.gcs_id === row.gcs_id)
      for (const [pidStr, val] of Object.entries(row.qtyByProject)) {
        const quantity = val === '' ? 0 : Number(val)
        if (quantity !== ownedBy(item, Number(pidStr))) rows.push({ part: row.gcs_id, project: Number(pidStr), quantity })
      }
    }
    if (rows.length === 0) {
      setEditMode(false)
      setDraft([])
      return flash('No changes to save.', true)
    }
    setSaving(true)
    const { error } = await supabase.rpc('fn_apply_count', { p_entry_type: 'adjustment', p_note: editNote.trim(), p_rows: rows })
    setSaving(false)
    if (error) {
      console.error(error)
      return flash(rpcErrorText(error, 'Could not save changes.'), false)
    }
    setEditMode(false)
    setDraft([])
    setEditNote('')
    flash(`Saved — ${rows.length} count${rows.length === 1 ? '' : 's'} changed.`, true)
    await reloadStock()
  }

  // ------- stock transfer -------
  async function doTransfer(item) {
    const qty = Number(qtyByPart[item.gcs_id])
    if (!fromId || !toId) return flash('Choose both the sending and the receiving entity.', false)
    if (!transferNote.trim()) return flash('A reason is required before saving.', false)
    if (!qty || qty <= 0) return flash('Enter a quantity greater than zero.', false)
    setBusyPart(item.gcs_id)
    const { data: journalId, error } = await supabase.rpc('fn_stock_transfer', {
      p_part: item.gcs_id,
      p_from: Number(fromId),
      p_to: Number(toId),
      p_qty: qty,
      p_note: transferNote.trim(),
      p_from_loc: fromLoc || null,
      p_to_loc: toLoc,
    })
    setBusyPart(null)
    if (error) {
      console.error(error)
      return flash(rpcErrorText(error, 'Could not record the transfer.'), false)
    }
    setQtyByPart((prev) => ({ ...prev, [item.gcs_id]: '' }))
    // The transfer also wrote a PO between the two entities; its number is on the History entry.
    let poNumber = null
    if (journalId) {
      const { data: entry } = await supabase.from('inventory_journal').select('note').eq('id', journalId).maybeSingle()
      poNumber = entry?.note?.match(/PO-[0-9A-Za-z-]+/)?.[0] ?? null
    }
    flash(poNumber ? `Stock transfer recorded. PO ${poNumber} created.` : 'Stock transfer recorded.', true)
    await reloadStock()
    reloadPurchaseRequests?.()
  }

  // ------- upload -------
  function findProject(name) {
    const q = (name || '').trim().toLowerCase()
    if (!q) return null
    return (
      projects.find((p) => p.name.toLowerCase() === q) ||
      projects.find((p) => shortProjectName(p.name).toLowerCase() === q) ||
      null
    )
  }
  async function onUploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)
    setUploadPreview(null)
    setUploadErrors([])
    const parsed = Papa.parse(await file.text(), { header: true, skipEmptyLines: true })
    const fieldMap = {}
    for (const f of parsed.meta.fields || []) fieldMap[normalizeHeader(f)] = f
    const gcsKey = fieldMap.gcspn || fieldMap.gcsid || fieldMap.gcs
    const projectKey = fieldMap.entity || fieldMap.project || fieldMap.site
    const qtyKey = fieldMap.quantity || fieldMap.qty || fieldMap.stockonhand
    if (!gcsKey || !projectKey || !qtyKey) {
      setUploadErrors(['CSV must have columns for GCS P/N, Entity, and Quantity (column names not recognized).'])
      return
    }
    const errors = []
    const rows = []
    parsed.data.forEach((row, i) => {
      const n = i + 2
      const gcsId = parseInt(row[gcsKey], 10)
      const part = parts.find((p) => p.gcs_id === gcsId)
      const project = findProject(row[projectKey])
      const qty = parseInt(row[qtyKey], 10)
      if (!part) return errors.push(`Row ${n}: GCS P/N "${row[gcsKey]}" not found in Master List.`)
      if (!project) return errors.push(`Row ${n}: Entity "${row[projectKey]}" does not match any entity.`)
      if (Number.isNaN(qty) || qty < 0) return errors.push(`Row ${n}: Quantity "${row[qtyKey]}" is not a valid number.`)
      const item = stockItems.find((s) => s.gcs_id === gcsId)
      rows.push({
        gcs_id: gcsId,
        part,
        project_id: project.id,
        project_name: project.name,
        quantity: qty,
        previous: item?.perProject?.[project.id] ? item.perProject[project.id].onHand : null,
      })
    })
    setUploadErrors(errors)
    setUploadPreview(rows.length ? { rows } : null)
  }
  async function confirmUpload() {
    if (!uploadPreview?.rows.length) return
    if (!uploadNote.trim()) return flash('A reason is required before uploading.', false)
    setUploading(true)
    const { error } = await supabase.rpc('fn_apply_count', {
      p_entry_type: 'count',
      p_note: `${uploadNote.trim()} — ${uploadFileName} (${uploadPreview.rows.length} rows)`,
      p_rows: uploadPreview.rows.map((r) => ({ part: r.gcs_id, project: r.project_id, quantity: r.quantity })),
    })
    setUploading(false)
    if (error) {
      console.error(error)
      return flash(rpcErrorText(error, 'Could not upload the count.'), false)
    }
    flash(`Inventory count uploaded — ${uploadPreview.rows.length} rows updated.`, true)
    setUploadPreview(null)
    setUploadFileName('')
    setUploadNote('')
    setView('parts')
    await reloadStock()
  }

  // ------- exports -------
  function exportTemplate() {
    const rows = []
    for (const item of stockItems) {
      for (const p of projects) {
        const e = item.perProject[p.id]
        if (e) rows.push({ 'GCS P/N': item.gcs_id, Entity: p.name, Quantity: e.onHand ?? 0 })
      }
    }
    downloadCsv(`inventory-ownership-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(rows))
  }
  function exportList() {
    const selected = entityFilter === 'all' ? null : projects.find((p) => String(p.id) === String(entityFilter))
    const rows = []
    for (const p of selected ? [selected] : projects) {
      for (const item of visibleItems) {
        const e = item.perProject[p.id]
        if (!e) continue
        rows.push({
          Entity: p.name,
          'GCS P/N': item.gcs_id,
          'Part ID': item.part?.gcs_part_id || '',
          Manufacturer: item.part?.manufacturer || '',
          'Manufacturer P/N': item.part?.manufacturer_part_number || '',
          Description: item.part?.description || '',
          Owned: e.onHand ?? 0,
          'Target Stock': e.target ?? '',
          'On Order (not received)': incomingByKey?.get(`${p.id}:${item.gcs_id}`)?.qty ?? 0,
        })
      }
    }
    const name = selected ? shortProjectName(selected.name).replace(/[^a-z0-9]+/gi, '-') : 'all-entities'
    downloadCsv(`ownership-${name}-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(rows))
  }

  // ------- render -------
  const fromProject = projects.find((p) => String(p.id) === String(fromId))
  const toProject = projects.find((p) => String(p.id) === String(toId))
  const headCols = shownProjects.length
  const hasIncoming = !modeActive && visibleItems.some((i) => incomingAcross(i).qty > 0)

  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          <button className={view === 'parts' && !modeActive ? 'btn-primary' : 'btn-secondary'} onClick={() => showView('parts')}>
            Ownership
          </button>
          {canEdit && (
            <>
              <button className={view === 'count' || editMode ? 'btn-primary' : 'btn-secondary'} onClick={() => showView('count')}>
                Update Count
              </button>
              <button className={transferMode ? 'btn-primary' : 'btn-secondary'} onClick={startTransfer}>
                Stock Transfer
              </button>
            </>
          )}
        </div>

        {editMode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={saveEdits} disabled={saving || !editNote.trim()}>
              {saving ? 'Saving…' : 'Save Adjustment'}
            </button>
            <input type="text" placeholder="Search parts to narrow the list..." value={editSearch} onChange={(e) => setEditSearch(e.target.value)} />
            <input type="text" placeholder="Reason for this adjustment (required)" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            <button className="btn-secondary" onClick={leaveModes} disabled={saving}>
              Cancel
            </button>
          </div>
        )}

        {transferMode && (
          <>
            <div className="edit-toolbar" style={{ marginTop: 8 }}>
              <span className="sub" style={{ margin: 0 }}>From:</span>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="sub" style={{ margin: 0 }}>To:</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Select destination…</option>
                {projects.filter((p) => String(p.id) !== String(fromId)).map((p) => (
                  <option value={p.id} key={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="text" placeholder="Reason for this transfer (required)" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
              <button className="btn-secondary" onClick={leaveModes}>
                Done
              </button>
            </div>
            <div className="edit-toolbar" style={{ marginTop: 6 }}>
              <span className="sub" style={{ margin: 0 }}>Units are being taken from:</span>
              <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
                <option value="">Wherever they are (automatic)</option>
                <option value="site">{fromProject ? `${shortProjectName(fromProject.name)}'s own site` : "The sender's own site"}</option>
                <option value="storage">Storage</option>
                <option value="barn">Barn</option>
              </select>
              <span className="sub" style={{ margin: 0 }}>and end up in:</span>
              <select value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
                <option value="site">{toProject ? `${shortProjectName(toProject.name)}'s own site` : "The receiver's own site"}</option>
                <option value="storage">Storage</option>
                <option value="barn">Barn</option>
              </select>
              <span className="sub" style={{ margin: 0 }}>
                The move is assumed to have already happened, so the owner and the location change together. Each saved transfer also creates a closed PO from the sender to the receiver.
              </span>
            </div>
          </>
        )}

        {(status || loadError) && (
          <div className={'status ' + (status ? (status.ok ? 'ok' : 'err') : 'err')}>{status ? status.msg : loadError}</div>
        )}
      </div>

      {view === 'count' && !editMode && (
        <div className="card">
          <div className="card-header">
            <h2>Update Count</h2>
            <p className="sub" style={{ margin: 0 }}>
              A count sets how many an entity owns. Extra units appear on that entity's own site; removed units come off its own site first,
              then Storage, then the Barn. Every change is recorded in History.
            </p>
          </div>
          <div className="edit-toolbar">
            <button className="btn-primary" onClick={startEdit}>
              Individual Adjustment
            </button>
            <button className="btn-secondary" onClick={exportTemplate}>
              Export Current Counts (CSV)
            </button>
          </div>
          <h3 style={{ fontSize: 14, margin: '16px 0 4px' }}>Upload a count</h3>
          <p className="sub" style={{ margin: '0 0 8px' }}>
            CSV with columns: GCS P/N, Entity, Quantity. Every row replaces that part's count at that entity. One bad row cancels the whole upload.
          </p>
          <input type="file" accept=".csv" onChange={onUploadFile} />
          {uploadErrors.length > 0 && (
            <div className="status err" style={{ marginTop: 12 }}>
              {uploadErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {uploadPreview && (
            <>
              <div className="sheet-wrap" style={{ marginTop: 12 }}>
                <table className="sheet">
                  <colgroup>
                    <col className="col-rowhead" /><col style={{ width: '18%' }} /><col /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="header-row">
                      <th className="row-head">GCS P/N</th><th>Entity</th><th>Description</th>
                      <th className="center-cell">Previous</th><th className="center-cell">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="row-head">{r.gcs_id}</td>
                        <td>{r.project_name}</td>
                        <td>{r.part?.description || '—'}</td>
                        <td className="center-cell">{r.previous ?? '—'}</td>
                        <td className="center-cell">{r.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="edit-toolbar" style={{ marginTop: 12 }}>
                <input type="text" placeholder="Reason for this upload (required)" value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} />
                <button className="btn-primary" onClick={confirmUpload} disabled={uploading || !uploadNote.trim()}>
                  {uploading ? 'Uploading…' : `Confirm Upload (${uploadPreview.rows.length} rows)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {(view === 'parts' || editMode) && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h2>
                {editMode ? 'Update Count' : transferMode ? 'Stock Transfer' : 'Ownership'}{' '}
                {stockLoading ? '' : `(${editMode ? visibleDraft.length : visibleItems.length})`}
              </h2>
              {!modeActive && (
                <>
                  <div className="project-select-wrap" style={{ maxWidth: 280, flex: 'none' }}>
                    <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setGcsFilter('') }}>
                      <option value="all">All Entities</option>
                      {projects.map((p) => (
                        <option value={p.id} key={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={exportList} disabled={stockLoading || visibleItems.length === 0}
                    title="Download this list as a CSV: the selected entity, or every entity grouped by entity">
                    Export CSV
                  </button>
                </>
              )}
            </div>
            {!modeActive && (
              <p className="sub" style={{ margin: 0 }}>
                Who owns each part. Click a part to see where it physically is.
                {hasIncoming && (
                  <> <span style={{ background: INCOMING_BG, padding: '0 6px', borderRadius: 3 }}>Yellow</span> numbers include spares on issued POs that haven&apos;t been received yet.</>
                )}
              </p>
            )}
            {editMode && (
              <p className="sub" style={{ margin: 0 }}>
                Each cell is how many that entity owns. Editing a count changes the units on its own site (up) or removes them from its site first, then Storage, then the Barn (down).
              </p>
            )}
            {transferMode && (
              <p className="sub" style={{ margin: 0 }}>
                The sender and receiver columns are highlighted. Enter a quantity and press Transfer on the part's row. &quot;Site / off&quot; is how many of the sender&apos;s units are on its own site and how many are in Storage or the Barn.
              </p>
            )}
          </div>

          {stockLoading ? (
            <div className="empty">Loading...</div>
          ) : (
            <div className="sheet-wrap">
              <table className="sheet" style={singleEntity ? undefined : { minWidth: 70 + 180 + projects.length * 80 + 2 * 80 + (transferMode ? 70 + 130 : 0) }}>
                <colgroup>
                  <col className="col-rowhead" style={!singleEntity ? { width: '70px' } : undefined} />
                  <col style={!singleEntity ? { width: '180px' } : undefined} />
                  {shownProjects.map((p) => <col key={p.id} style={singleEntity ? { width: '10%' } : { width: `${58 / projects.length}%` }} />)}
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '7%' }} />
                  {transferMode && (<><col style={{ width: '8%' }} /><col style={{ width: '6%' }} /><col style={{ width: '9%' }} /></>)}
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th className="row-head">GCS P/N</th>
                    <th>Description</th>
                    {shownProjects.map((p) => {
                      const isFrom = transferMode && String(p.id) === String(fromId)
                      const isTo = transferMode && String(p.id) === String(toId)
                      return (
                        <th key={p.id} className="center-cell" title={p.name}
                          style={isFrom ? { background: '#fde2e2' } : isTo ? { background: '#dbeafe' } : undefined}>
                          {shortProjectName(p.name)}{isFrom && ' (From)'}{isTo && ' (To)'}
                        </th>
                      )
                    })}
                    <th className="center-cell total-col">Target Stock</th>
                    <th className="center-cell total-col">{singleEntity ? 'Total - All Entities' : 'Total Owned'}</th>
                    {transferMode && (<><th className="center-cell">Site / off</th><th className="center-cell">Qty</th><th className="center-cell"></th></>)}
                  </tr>
                  {!editMode && (
                    <tr className="filter-row">
                      <th className="row-head">
                        <select value={gcsFilter} onChange={(e) => setGcsFilter(e.target.value)}>
                          <option value="">All</option>
                          {gcsOptions.map((id) => <option value={id} key={id}>{id}</option>)}
                        </select>
                      </th>
                      <th colSpan={1 + headCols + 2 + (transferMode ? 3 : 0)}></th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {editMode ? (
                    visibleDraft.length === 0 ? (
                      <tr><td className="empty" colSpan={projects.length + 5}>No parts match your search.</td></tr>
                    ) : (
                      visibleDraft.map((row) => {
                        const idx = draft.indexOf(row)
                        const target = computeTargetSum(Object.values(row.perProject))
                        const sum = Object.values(row.qtyByProject).reduce((s, v) => s + (v === '' ? 0 : Number(v)), 0)
                        return (
                          <tr key={row.gcs_id}>
                            <td className="row-head">{row.gcs_id}</td>
                            <td>{row.part?.description || '—'}</td>
                            {projects.map((p) => (
                              <td className="center-cell" key={p.id}>
                                {Object.prototype.hasOwnProperty.call(row.qtyByProject, p.id) ? (
                                  <input type="number" min="0" value={row.qtyByProject[p.id]}
                                    onChange={(e) => setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, qtyByProject: { ...r.qtyByProject, [p.id]: e.target.value } } : r)))} />
                                ) : '—'}
                              </td>
                            ))}
                            <td className="center-cell total-col">{target}</td>
                            <td className="center-cell total-col">{sum}</td>
                          </tr>
                        )
                      })
                    )
                  ) : visibleItems.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={headCols + 4 + (transferMode ? 3 : 0)}>
                        {gcsFilter ? 'No parts match your filter.' : singleEntity ? 'No parts required for this entity.' : 'No parts yet — required parts must be added on the Required Inventory tab first.'}
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((item) => {
                      const all = incomingAcross(item)
                      const clickable = !modeActive
                      const fromEntry = transferMode && fromId ? item.perProject[Number(fromId)] : null
                      const toOk = transferMode && toId ? Boolean(item.perProject[Number(toId)]) : true
                      return (
                        <tr key={item.gcs_id} id={`own-row-${item.gcs_id}`}
                          className={[clickable ? 'row-link' : '', focusGcsId === item.gcs_id ? 'row-focus' : ''].filter(Boolean).join(' ') || undefined}
                          onClick={clickable ? () => onShowLocation?.(item.gcs_id) : undefined}
                          onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onShowLocation?.(item.gcs_id) } : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          title={clickable ? 'Show where this part physically is' : undefined}>
                          <td className="row-head">{item.gcs_id}</td>
                          <td>{item.part?.description || '—'}</td>
                          {shownProjects.map((p) => {
                            const entry = item.perProject[p.id]
                            const inc = entry ? incomingAt(p.id, item.gcs_id) : null
                            const isFrom = transferMode && String(p.id) === String(fromId)
                            const isTo = transferMode && String(p.id) === String(toId)
                            return (
                              <td key={p.id} className="center-cell" title={inc ? incomingTitle(inc.pos) : undefined}
                                style={isFrom ? { background: '#fde2e2' } : isTo ? { background: '#dbeafe' } : inc ? { background: INCOMING_BG } : undefined}>
                                {entry ? entry.onHand + (inc ? inc.qty : 0) : '—'}
                              </td>
                            )
                          })}
                          <td className="center-cell total-col">
                            {singleEntity ? item.perProject[Number(entityFilter)]?.target ?? 0 : computeTargetSum(Object.values(item.perProject))}
                          </td>
                          <td className="center-cell total-col" style={all.qty > 0 ? { background: INCOMING_BG } : undefined} title={all.qty > 0 ? incomingTitle(all.pos) : undefined}>
                            {totalOwned(item) + all.qty}
                          </td>
                          {transferMode && (
                            <>
                              <td className="center-cell">
                                {fromEntry ? `${item.loc?.site?.[Number(fromId)] || 0} / ${offSiteUnits(item, Number(fromId))}` : '—'}
                              </td>
                              <td className="center-cell">
                                <input type="number" min="0" value={qtyByPart[item.gcs_id] ?? ''}
                                  onChange={(e) => setQtyByPart((prev) => ({ ...prev, [item.gcs_id]: e.target.value }))} />
                              </td>
                              <td className="center-cell">
                                <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => doTransfer(item)}
                                  title={toId && !toOk ? "The receiving entity doesn't use this part — add it on Required Inventory first." : undefined}
                                  disabled={busyPart === item.gcs_id || !toId || !toOk || !transferNote.trim() || !qtyByPart[item.gcs_id]}>
                                  {busyPart === item.gcs_id ? 'Saving…' : 'Transfer'}
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

export default OwnershipTab
