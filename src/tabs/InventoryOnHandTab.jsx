import { Fragment } from 'react'
import { computeTargetSum, shortProjectName } from '../utils'

function InventoryOnHandTab({
  canEditInventory,
  stockPanel,
  resetStockPanel,
  stockEditMode,
  locationEditMode,
  setStockPanel,
  runAction,
  loadJournalEntries,
  savingStockEdits,
  handleSaveStockEdits,
  adjustNote,
  setAdjustNote,
  stockEditFilter,
  setStockEditFilter,
  handleCancelStockEdits,
  savingLocationEdits,
  handleSaveLocationEdits,
  locationEditFilter,
  setLocationEditFilter,
  locationNote,
  setLocationNote,
  handleCancelLocationEdits,
  stockStatus,
  handleExportInventory,
  handleUploadFileChange,
  uploadErrors,
  uploadPreview,
  uploadNote,
  setUploadNote,
  uploading,
  handleConfirmUpload,
  recordUseMode,
  cancelRecordPartUse,
  useNote,
  setUseNote,
  useQtyByPart,
  updateUseQty,
  savingUsePartId,
  handleRecordPartUse,
  transferMode,
  cancelStockTransfer,
  transferToProjectId,
  setTransferToProjectId,
  transferNote,
  setTransferNote,
  transferQtyByPart,
  updateTransferQty,
  savingTransferPartId,
  handleStockTransfer,
  journalLoading,
  journalEntries,
  expandedJournalId,
  toggleJournalExpand,
  journalLines,
  projects,
  parts,
  stockLoading,
  visibleDraftStockItems,
  visibleDraftLocationItems,
  visibleStockItems,
  stockViewProjectId,
  setStockViewProjectId,
  stockViewFilter,
  setStockViewFilter,
  gcsIdOptions,
  draftStockItems,
  updateStockDraftField,
  draftLocationItems,
  updateLocationDraftField,
}) {
  const isPartsActive = !stockPanel && !stockEditMode && !locationEditMode && !recordUseMode && !transferMode
  const isCountActive = stockPanel === 'count' || stockPanel === 'upload' || stockEditMode
  const isHistoryActive = stockPanel === 'history'

  function hasUnsavedStockEdits() {
    return draftStockItems.some((row) =>
      Object.entries(row.qtyByProject).some(([pid, val]) => {
        const orig = row.perProject[pid]?.onHand ?? 0
        const newVal = val === '' ? 0 : Number(val)
        return newVal !== orig
      })
    )
  }

  function hasUnsavedLocationEdits() {
    return draftLocationItems.some((row) => {
      const newStorage = row.storage_qty === '' ? 0 : Number(row.storage_qty)
      const newBarn = row.barn_qty === '' ? 0 : Number(row.barn_qty)
      return newStorage !== (row.part?.storage_qty ?? 0) || newBarn !== (row.part?.barn_qty ?? 0)
    })
  }

  function exitCurrentMode() {
    if (stockEditMode) handleCancelStockEdits()
    else if (locationEditMode) handleCancelLocationEdits()
    else if (recordUseMode) cancelRecordPartUse()
    else if (transferMode) cancelStockTransfer()
    else if (stockPanel) resetStockPanel()
  }

  // Lets the tab row stay visible and clickable at all times instead of
  // being replaced by whichever mode is active -- switching straight to a
  // different tab first exits whatever's currently open, guarding against
  // silently losing typed-but-unsaved adjustment/location edits.
  function switchTo(target) {
    if (
      ((stockEditMode && hasUnsavedStockEdits()) || (locationEditMode && hasUnsavedLocationEdits())) &&
      !window.confirm('You have unsaved changes that will be lost. Switch anyway?')
    ) {
      return
    }
    exitCurrentMode()
    if (target === 'count') setStockPanel('count')
    if (target === 'record-use') runAction({ type: 'record-use' })
    if (target === 'stock-transfer') runAction({ type: 'stock-transfer' })
    if (target === 'location-edit') runAction({ type: 'location-edit' })
    if (target === 'history') {
      setStockPanel('history')
      loadJournalEntries()
    }
  }

  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          <button className={isPartsActive ? 'btn-primary' : 'btn-secondary'} onClick={() => switchTo('parts')}>
            Parts
          </button>
          <button className={isCountActive ? 'btn-primary' : 'btn-secondary'} onClick={() => switchTo('count')}>
            Update Inventory Count
          </button>
          {canEditInventory && (
            <>
              <button
                className={recordUseMode ? 'btn-primary' : 'btn-secondary'}
                onClick={() => switchTo('record-use')}
              >
                Record Part Use
              </button>
              <button
                className={transferMode ? 'btn-primary' : 'btn-secondary'}
                onClick={() => switchTo('stock-transfer')}
              >
                Stock Transfer
              </button>
              <button
                className={locationEditMode ? 'btn-primary' : 'btn-secondary'}
                onClick={() => switchTo('location-edit')}
              >
                Update Location
              </button>
            </>
          )}
          <button className={isHistoryActive ? 'btn-primary' : 'btn-secondary'} onClick={() => switchTo('history')}>
            History
          </button>
        </div>

        {recordUseMode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <input
              type="text"
              placeholder="Reason for this use (required)"
              value={useNote}
              onChange={(e) => setUseNote(e.target.value)}
              required
            />
            <button className="btn-secondary" onClick={cancelRecordPartUse}>
              Done
            </button>
          </div>
        )}
        {transferMode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <span className="sub" style={{ margin: 0 }}>
              To project:
            </span>
            <select
              value={transferToProjectId ?? ''}
              onChange={(e) => setTransferToProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select destination…</option>
              {projects
                .filter((p) => String(p.id) !== String(stockViewProjectId))
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="Reason for this transfer (required)"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              required
            />
            <button className="btn-secondary" onClick={cancelStockTransfer}>
              Done
            </button>
          </div>
        )}
        {stockEditMode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <button
              className="btn-primary"
              onClick={handleSaveStockEdits}
              disabled={savingStockEdits || !adjustNote.trim()}
            >
              {savingStockEdits ? 'Saving…' : 'Save Adjustment'}
            </button>
            <input
              type="text"
              placeholder="Search parts to narrow the list..."
              value={stockEditFilter}
              onChange={(e) => setStockEditFilter(e.target.value)}
            />
            <input
              type="text"
              placeholder="Reason for this adjustment (required)"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              required
            />
            <button className="btn-secondary" onClick={handleCancelStockEdits} disabled={savingStockEdits}>
              Cancel
            </button>
          </div>
        )}
        {locationEditMode && (
          <div className="edit-toolbar" style={{ marginTop: 8 }}>
            <button
              className="btn-primary"
              onClick={handleSaveLocationEdits}
              disabled={savingLocationEdits || !locationNote.trim()}
            >
              {savingLocationEdits ? 'Saving…' : 'Save Locations'}
            </button>
            <input
              type="text"
              placeholder="Search parts to narrow the list..."
              value={locationEditFilter}
              onChange={(e) => setLocationEditFilter(e.target.value)}
            />
            <input
              type="text"
              placeholder="Reason for this change (required)"
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              required
            />
            <button className="btn-secondary" onClick={handleCancelLocationEdits} disabled={savingLocationEdits}>
              Cancel
            </button>
          </div>
        )}

        {stockStatus && (
          <div className={'status ' + (stockStatus.ok ? 'ok' : 'err')}>{stockStatus.msg}</div>
        )}
      </div>

      {stockPanel === 'count' && (
        <div className="card">
          <div className="card-header">
            <h2>Update Inventory Count</h2>
            <p className="sub" style={{ margin: 0 }}>
              Both options update the same on-hand counts — just at different scale. Pick whichever
              fits what you're doing.
            </p>
          </div>
          <div className="edit-toolbar">
            {canEditInventory && (
              <button
                className="btn-primary"
                onClick={() => {
                  runAction({ type: 'stock-edit' })
                  setStockPanel(null)
                }}
              >
                Individual Adjustment
              </button>
            )}
            <button className="btn-secondary" onClick={() => setStockPanel('upload')}>
              Bulk Export / Upload (CSV)
            </button>
          </div>
          {!canEditInventory && (
            <p className="sub" style={{ marginTop: 8 }}>
              Individual adjustments require inventory edit access — bulk upload is still available
              above.
            </p>
          )}
        </div>
      )}

      {stockPanel === 'upload' && (
        <div className="card">
          <div className="card-header">
            <h2>Bulk Export / Upload</h2>
            <p className="sub" style={{ margin: 0 }}>
              CSV with columns: GCS P/N, Entity, Quantity. Every row replaces that part's stock at
              that entity — the previous value is archived in History.
            </p>
          </div>
          <div className="edit-toolbar" style={{ marginBottom: 12 }}>
            <button className="btn-secondary" onClick={handleExportInventory}>
              Export Current Inventory (CSV)
            </button>
          </div>
          <input type="file" accept=".csv" onChange={handleUploadFileChange} />
          {uploadErrors.length > 0 && (
            <div className="status err" style={{ marginTop: 12 }}>
              {uploadErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          {uploadPreview && (
            <>
              <div className="sheet-wrap" style={{ marginTop: 12 }}>
                <table className="sheet">
                  <colgroup>
                    <col className="col-rowhead" />
                    <col style={{ width: '18%' }} />
                    <col />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="header-row">
                      <th className="row-head">GCS P/N</th>
                      <th>Entity</th>
                      <th>Description</th>
                      <th className="center-cell">Previous</th>
                      <th className="center-cell">New</th>
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
                <input
                  type="text"
                  placeholder="Reason for this upload (required)"
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  required
                />
                <button
                  className="btn-primary"
                  onClick={handleConfirmUpload}
                  disabled={uploading || !uploadNote.trim()}
                >
                  {uploading ? 'Uploading…' : `Confirm Upload (${uploadPreview.rows.length} rows)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {stockPanel === 'history' && (
        <div className="card">
          <div className="card-header">
            <h2>History {journalLoading ? '' : `(${journalEntries.length})`}</h2>
          </div>
          {journalLoading ? (
            <div className="empty">Loading...</div>
          ) : journalEntries.length === 0 ? (
            <div className="empty">No changes logged yet.</div>
          ) : (
            <div className="sheet-wrap">
              <table className="sheet">
                <thead>
                  <tr className="header-row">
                    <th className="row-head">Date</th>
                    <th>Type</th>
                    <th>Note</th>
                    <th className="center-cell"># Changed</th>
                    <th className="center-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.map((j) => {
                    const lineCount = j.inventory_journal_lines?.[0]?.count ?? 0
                    const expanded = expandedJournalId === j.id
                    return (
                      <Fragment key={j.id}>
                        <tr>
                          <td className="row-head">{new Date(j.created_at).toLocaleString()}</td>
                          <td>{j.entry_type === 'count' ? 'Inventory Count' : 'Adjustment'}</td>
                          <td>{j.note || '—'}</td>
                          <td className="center-cell">{lineCount}</td>
                          <td className="center-cell">
                            <button className="btn-secondary" onClick={() => toggleJournalExpand(j.id)}>
                              {expanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${j.id}-detail`}>
                            <td colSpan={5}>
                              <table className="sheet">
                                <colgroup>
                                  <col style={{ width: '16%' }} />
                                  <col className="col-rowhead" />
                                  <col />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                </colgroup>
                                <thead>
                                  <tr className="header-row">
                                    <th>Entity</th>
                                    <th className="row-head">GCS P/N</th>
                                    <th>Description</th>
                                    <th className="center-cell">Previous Qty</th>
                                    <th className="center-cell">New Qty</th>
                                    <th className="center-cell">Previous Storage</th>
                                    <th className="center-cell">New Storage</th>
                                    <th className="center-cell">Previous Barn</th>
                                    <th className="center-cell">New Barn</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(journalLines[j.id] ?? []).map((line) => (
                                    <tr key={line.id}>
                                      <td>
                                        {line.project_id
                                          ? projects.find((p) => p.id === line.project_id)?.name || line.project_id
                                          : '—'}
                                      </td>
                                      <td className="row-head">{line.part_gcs_id}</td>
                                      <td>
                                        {parts.find((p) => p.gcs_id === line.part_gcs_id)?.description || '—'}
                                      </td>
                                      <td className="center-cell">{line.previous_quantity ?? '—'}</td>
                                      <td className="center-cell">{line.new_quantity ?? '—'}</td>
                                      <td className="center-cell">{line.previous_storage_qty ?? '—'}</td>
                                      <td className="center-cell">{line.new_storage_qty ?? '—'}</td>
                                      <td className="center-cell">{line.previous_barn_qty ?? '—'}</td>
                                      <td className="center-cell">{line.new_barn_qty ?? '—'}</td>
                                    </tr>
                                  ))}
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
      )}

      {!stockPanel && (
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2>
              {stockEditMode ? 'Inventory Adjustment' : locationEditMode ? 'Update Location' : 'Parts'}{' '}
              {stockLoading
                ? ''
                : `(${
                    stockEditMode
                      ? visibleDraftStockItems.length
                      : locationEditMode
                      ? visibleDraftLocationItems.length
                      : visibleStockItems.length
                  })`}
            </h2>
            {!stockEditMode && !locationEditMode && (
              <div className="project-select-wrap" style={{ maxWidth: 220, flex: 'none' }}>
                <select
                  id="stock_view_project"
                  value={stockViewProjectId}
                  onChange={(e) => setStockViewProjectId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Entities</option>
                  {projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {stockEditMode && (
            <p className="sub" style={{ margin: 0 }}>
              Each cell shows the current on-hand quantity — edit it up or down directly. Saving
              archives the previous values and logs an entry in History.
            </p>
          )}
          {locationEditMode && (
            <p className="sub" style={{ margin: 0 }}>
              Enter how many units of each part sit in Storage and in the Barn. Entity is
              calculated automatically as whatever's left over. Saving archives the previous values
              and logs an entry in History.
            </p>
          )}
        </div>

        {stockLoading ? (
          <div className="empty">Loading...</div>
        ) : (
          <div className="sheet-wrap">
            {(() => {
              const singleProjectView = !stockEditMode && !locationEditMode && stockViewProjectId !== 'all'
              const viewProject = singleProjectView ? projects.find((p) => p.id === stockViewProjectId) : null
              return (
            <table className="sheet">
              <colgroup>
                <col className="col-rowhead" />
                <col />
                {singleProjectView ? (
                  <col style={{ width: '8%' }} />
                ) : (
                  projects.map((p) => (
                    <col key={p.id} style={{ width: `${48 / projects.length}%` }} />
                  ))
                )}
                <col style={{ width: '6%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                {(recordUseMode || transferMode) && (
                  <>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '11%' }} />
                  </>
                )}
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head" rowSpan={2}>GCS P/N</th>
                  <th rowSpan={2}>Description</th>
                  {singleProjectView ? (
                    <th className="center-cell" rowSpan={2}>{shortProjectName(viewProject?.name || '')}</th>
                  ) : (
                    projects.map((p) => (
                      <th className="center-cell" key={p.id} rowSpan={2} title={p.name}>
                        {shortProjectName(p.name)}
                      </th>
                    ))
                  )}
                  <th className="center-cell total-col" rowSpan={2}>Target Stock</th>
                  <th className="center-cell total-col" rowSpan={2}>
                    {singleProjectView ? 'Available - All Entities' : 'Available on Hand'}
                  </th>
                  <th className="center-cell total-col" colSpan={3}>
                    {singleProjectView ? 'Storage Location - This Entity' : 'Storage Location'}
                  </th>
                  {recordUseMode && (
                    <th className="center-cell" colSpan={2} rowSpan={2}>
                      Record Use
                    </th>
                  )}
                  {transferMode && (
                    <th className="center-cell" colSpan={2} rowSpan={2}>
                      Transfer
                    </th>
                  )}
                </tr>
                <tr className="header-row">
                  <th className="center-cell total-col">Entity</th>
                  <th className="center-cell">Storage</th>
                  <th className="center-cell">Barn</th>
                </tr>
                {!stockEditMode && !locationEditMode && (
                  <tr className="filter-row">
                    <th className="row-head">
                      <select
                        value={stockViewFilter}
                        onChange={(e) => setStockViewFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        {gcsIdOptions.map((id) => (
                          <option value={id} key={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th
                      colSpan={
                        (singleProjectView ? 1 : projects.length) +
                        6 +
                        (recordUseMode || transferMode ? 2 : 0)
                      }
                    ></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {stockEditMode ? (
                  visibleDraftStockItems.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={projects.length + 5}>
                        No parts match your search.
                      </td>
                    </tr>
                  ) : (
                    visibleDraftStockItems.map((row) => {
                      const i = draftStockItems.indexOf(row)
                      const targetSum = computeTargetSum(Object.values(row.perProject))
                      const onHandSum = Object.values(row.qtyByProject).reduce(
                        (sum, v) => sum + (v === '' ? 0 : Number(v)),
                        0
                      )
                      const storageQty = row.part?.storage_qty ?? 0
                      const barnQty = row.part?.barn_qty ?? 0
                      return (
                        <tr key={row.gcs_id}>
                          <td className="row-head">{row.gcs_id}</td>
                          <td>{row.part?.description || '—'}</td>
                          {projects.map((p) => {
                            const required = Object.prototype.hasOwnProperty.call(row.qtyByProject, p.id)
                            return (
                              <td className="center-cell" key={p.id}>
                                {required ? (
                                  <input
                                    type="number"
                                    min="0"
                                    value={row.qtyByProject[p.id]}
                                    onChange={(e) => updateStockDraftField(i, p.id, e.target.value)}
                                  />
                                ) : (
                                  '—'
                                )}
                              </td>
                            )
                          })}
                          <td className="center-cell total-col">{targetSum}</td>
                          <td className="center-cell total-col">{onHandSum}</td>
                          <td className="center-cell total-col">{onHandSum - storageQty - barnQty}</td>
                          <td className="center-cell">{storageQty}</td>
                          <td className="center-cell">{barnQty}</td>
                        </tr>
                      )
                    })
                  )
                ) : locationEditMode ? (
                  visibleDraftLocationItems.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={projects.length + 5}>
                        No parts match your search.
                      </td>
                    </tr>
                  ) : (
                    visibleDraftLocationItems.map((row) => {
                      const i = draftLocationItems.indexOf(row)
                      const storageQty = row.storage_qty === '' ? 0 : Number(row.storage_qty)
                      const barnQty = row.barn_qty === '' ? 0 : Number(row.barn_qty)
                      const projectQty = row.onHandSum - storageQty - barnQty
                      return (
                        <tr key={row.gcs_id}>
                          <td className="row-head">{row.gcs_id}</td>
                          <td>{row.part?.description || '—'}</td>
                          {projects.map((p) => {
                            const entry = row.perProject[p.id]
                            return (
                              <td className="center-cell" key={p.id}>
                                {entry ? entry.onHand : '—'}
                              </td>
                            )
                          })}
                          <td className="center-cell total-col">—</td>
                          <td className="center-cell total-col">{row.onHandSum}</td>
                          <td className="center-cell total-col" style={projectQty < 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                            {projectQty}
                          </td>
                          <td className="center-cell">
                            <input
                              type="number"
                              min="0"
                              value={row.storage_qty}
                              onChange={(e) => updateLocationDraftField(i, 'storage_qty', e.target.value)}
                            />
                          </td>
                          <td className="center-cell">
                            <input
                              type="number"
                              min="0"
                              value={row.barn_qty}
                              onChange={(e) => updateLocationDraftField(i, 'barn_qty', e.target.value)}
                            />
                          </td>
                        </tr>
                      )
                    })
                  )
                ) : visibleStockItems.length === 0 ? (
                  <tr>
                    <td
                      className="empty"
                      colSpan={
                        (singleProjectView ? 1 : projects.length) +
                        7 +
                        (recordUseMode || transferMode ? 2 : 0)
                      }
                    >
                      {stockViewFilter
                        ? 'No parts match your filter.'
                        : singleProjectView
                        ? 'No parts required for this entity.'
                        : 'No parts yet — required parts must be added on the Required Inventory tab first.'}
                    </td>
                  </tr>
                ) : (
                  visibleStockItems.map((item) => {
                    const viewEntry = singleProjectView ? item.perProject[stockViewProjectId] : null
                    return (
                      <tr key={item.gcs_id}>
                        <td className="row-head">{item.gcs_id}</td>
                        <td>{item.part?.description || '—'}</td>
                        {singleProjectView ? (
                          <td className="center-cell">{viewEntry ? viewEntry.onHand : '—'}</td>
                        ) : (
                          projects.map((p) => {
                            const entry = item.perProject[p.id]
                            return (
                              <td className="center-cell" key={p.id}>
                                {entry ? entry.onHand : '—'}
                              </td>
                            )
                          })
                        )}
                        <td className="center-cell total-col">
                          {singleProjectView ? (viewEntry ? viewEntry.target ?? 0 : '—') : item.targetSum}
                        </td>
                        <td className="center-cell total-col">{item.onHandSum}</td>
                        <td className="center-cell total-col">
                          {singleProjectView ? (viewEntry ? viewEntry.onHand : 0) : item.projectQty}
                        </td>
                        <td className="center-cell">{item.storageQty}</td>
                        <td className="center-cell">{item.barnQty}</td>
                        {recordUseMode && (
                          <>
                            <td className="center-cell">
                              <input
                                type="number"
                                min="0"
                                value={useQtyByPart[item.gcs_id] ?? ''}
                                onChange={(e) => updateUseQty(item.gcs_id, e.target.value)}
                              />
                            </td>
                            <td className="center-cell">
                              <button
                                className="btn-secondary"
                                style={{ whiteSpace: 'nowrap' }}
                                onClick={() => handleRecordPartUse(item.gcs_id)}
                                disabled={
                                  savingUsePartId === item.gcs_id ||
                                  !useNote.trim() ||
                                  !useQtyByPart[item.gcs_id]
                                }
                              >
                                {savingUsePartId === item.gcs_id ? 'Saving…' : 'Record Use'}
                              </button>
                            </td>
                          </>
                        )}
                        {transferMode && (
                          <>
                            <td className="center-cell">
                              <input
                                type="number"
                                min="0"
                                value={transferQtyByPart[item.gcs_id] ?? ''}
                                onChange={(e) => updateTransferQty(item.gcs_id, e.target.value)}
                              />
                            </td>
                            <td className="center-cell">
                              <button
                                className="btn-secondary"
                                style={{ whiteSpace: 'nowrap' }}
                                onClick={() => handleStockTransfer(item.gcs_id)}
                                disabled={
                                  savingTransferPartId === item.gcs_id ||
                                  !transferToProjectId ||
                                  !transferNote.trim() ||
                                  !transferQtyByPart[item.gcs_id]
                                }
                              >
                                {savingTransferPartId === item.gcs_id ? 'Saving…' : 'Transfer'}
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
              )
            })()}
          </div>
        )}
      </div>
      )}
    </>
  )
}

export default InventoryOnHandTab
