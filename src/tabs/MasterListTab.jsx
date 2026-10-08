import { useEffect, useRef, useState } from 'react'
import { emptyFilters, shortProjectName } from '../utils'

// Small picture icon. Opens the part's reference image in a popup.
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function MasterListTab({
  canEditInventory,
  manufacturerOptions,
  categoryOptions,
  usedByByPart,
  entities,
  masterPanel,
  resetMasterPanel,
  editMode,
  runAction,
  handleSaveEdits,
  savingEdits,
  addDraftRow,
  handleCancelEdits,
  status,
  importErrors,
  importPreview,
  handleImportFileChange,
  handleConfirmImport,
  importing,
  lastPartsUpdate,
  hasActiveFilter,
  setFilters,
  loadParts,
  loading,
  filters,
  updateFilter,
  gcsIdOptions,
  rows,
  parts,
  updateDraftField,
  removeDraftRow,
  onPartImage,
  imageBusyId,
}) {
  const [previewPart, setPreviewPart] = useState(null)
  const fileInput = useRef(null)
  const pickFor = useRef(null)

  useEffect(() => {
    if (!previewPart) return undefined
    const onKey = (e) => e.key === 'Escape' && setPreviewPart(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewPart])

  function chooseImage(gcsId) {
    pickFor.current = gcsId
    fileInput.current?.click()
  }
  function onImageChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires
    if (file && pickFor.current !== null) onPartImage(pickFor.current, file)
  }

  // The image cell: the icon (opens the popup) when the part has a picture; in edit mode also
  // Attach / Replace / Remove. A part that isn't saved yet has no number to file a picture under.
  const imageCell = (p) => {
    const busy = imageBusyId === p.gcs_id
    if (editMode && p._existing === false) return <span className="sub" style={{ margin: 0 }} title="Save the new part first, then attach its picture">—</span>
    return (
      <span className="img-cell">
        {p.image_url && (
          <button type="button" className="img-btn" title="Show picture" aria-label={`Show picture of part ${p.gcs_id}`} onClick={() => setPreviewPart(p)}>
            <ImageIcon />
          </button>
        )}
        {editMode && (
          <>
            <button type="button" className="img-edit-btn" disabled={busy} onClick={() => chooseImage(p.gcs_id)}>
              {busy ? '…' : p.image_url ? 'Replace' : 'Attach'}
            </button>
            {p.image_url && !busy && (
              <button type="button" className="img-edit-btn" title="Remove picture" onClick={() => onPartImage(p.gcs_id, null)}>
                ✕
              </button>
            )}
          </>
        )}
      </span>
    )
  }

  // Every entity that requires the part, by its short name (full names on hover).
  const usedByCell = (p) => {
    const used = usedByByPart.get(p.gcs_id) || []
    if (used.length === 0) return '—'
    return (
      <span title={used.map((e) => e.name).join(', ')}>{used.map((e) => shortProjectName(e.name)).join(', ')}</span>
    )
  }

  return (
    <>
      <datalist id="manufacturer-options">
        {manufacturerOptions.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>
      <datalist id="category-options">
        {categoryOptions.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>

      {canEditInventory && (
      <div className="card">
        {masterPanel ? (
          <div className="edit-toolbar">
            <button className="btn-secondary" onClick={resetMasterPanel}>
              ← Back to Master List
            </button>
          </div>
        ) : !editMode ? (
          <div className="edit-toolbar">
            <button className="btn-primary" onClick={() => runAction({ type: 'edit' })}>
              Edit List
            </button>
            <button className="btn-primary" onClick={() => runAction({ type: 'export-parts' })}>
              Export List
            </button>
            <button className="btn-primary" onClick={() => runAction({ type: 'import-parts' })}>
              Import List
            </button>
          </div>
        ) : (
          <div className="edit-toolbar">
            <button className="btn-primary" onClick={handleSaveEdits} disabled={savingEdits}>
              {savingEdits ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn-secondary" onClick={addDraftRow} disabled={savingEdits}>
              + Add Row
            </button>
            <button className="btn-secondary" onClick={handleCancelEdits} disabled={savingEdits}>
              Cancel
            </button>
          </div>
        )}
        {status && <div className={'status ' + (status.ok ? 'ok' : 'err')}>{status.msg}</div>}
      </div>
      )}

      {masterPanel === 'import' && (
        <div className="card">
          <div className="card-header">
            <h2>Import List</h2>
            <p className="sub" style={{ margin: 0 }}>
              CSV with columns: GCS P/N, Part ID, Mfr Part #, Manufacturer, Category,
              Description. Rows with a matching GCS P/N update that part; rows with GCS P/N left
              blank add a new part.
            </p>
          </div>
          <input type="file" accept=".csv" onChange={handleImportFileChange} />
          {importErrors.length > 0 && (
            <div className="status err" style={{ marginTop: 12 }}>
              {importErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          {importPreview && (
            <>
              <div className="sheet-wrap" style={{ marginTop: 12 }}>
                <table className="sheet">
                  <colgroup>
                    <col className="col-rowhead" />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '20%' }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="header-row">
                      <th className="row-head">GCS P/N</th>
                      <th>Action</th>
                      <th>Part ID</th>
                      <th>Manufacturer</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="row-head">{r.gcs_id ?? '—'}</td>
                        <td>{r.action === 'insert' ? 'Add new' : 'Update'}</td>
                        <td>{r.gcs_part_id}</td>
                        <td>{r.manufacturer || '—'}</td>
                        <td>{r.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="edit-toolbar" style={{ marginTop: 12 }}>
                <button className="btn-primary" onClick={handleConfirmImport} disabled={importing}>
                  {importing ? 'Importing…' : `Confirm Import (${importPreview.rows.length} rows)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!masterPanel && (
      <div className="card">
        <div className="card-header">
          <h2>
            Last Update: {lastPartsUpdate ? new Date(lastPartsUpdate).toLocaleString() : '—'}
          </h2>
          <div className="header-actions">
            {!editMode && hasActiveFilter && (
              <button className="btn-secondary" onClick={() => setFilters(emptyFilters)}>
                Clear filters
              </button>
            )}
            <button className="btn-secondary" onClick={loadParts} disabled={loading || editMode}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading...</div>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col className="col-rowhead" />
                <col style={{ width: editMode ? '110px' : '44px' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '12%' }} />
                <col />
                <col style={{ width: '9%' }} />
                {editMode && <col className="col-last" />}
              </colgroup>
              <thead>
                <tr>
                  <th className="row-head"></th>
                  <th></th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                  {editMode && <th className="col-last"></th>}
                </tr>
                <tr className="header-row">
                  <th className="row-head">GCS P/N</th>
                  <th title="Reference picture">Pic</th>
                  <th>Part ID</th>
                  <th>Mfr Part #</th>
                  <th>Manufacturer</th>
                  <th>Category</th>
                  <th>Used By</th>
                  <th>Description</th>
                  <th>Last Cost</th>
                  {editMode && <th></th>}
                </tr>
                {!editMode && (
                  <tr className="filter-row">
                    <th className="row-head">
                      <select
                        value={filters.gcs_id}
                        onChange={(e) => updateFilter('gcs_id', e.target.value)}
                      >
                        <option value="">All</option>
                        {gcsIdOptions.map((id) => (
                          <option value={id} key={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th></th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters.gcs_part_id}
                        onChange={(e) => updateFilter('gcs_part_id', e.target.value)}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters.manufacturer_part_number}
                        onChange={(e) => updateFilter('manufacturer_part_number', e.target.value)}
                      />
                    </th>
                    <th>
                      <select
                        value={filters.manufacturer}
                        onChange={(e) => updateFilter('manufacturer', e.target.value)}
                      >
                        <option value="">All</option>
                        {manufacturerOptions.map((v) => (
                          <option value={v} key={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.spare_category}
                        onChange={(e) => updateFilter('spare_category', e.target.value)}
                      >
                        <option value="">All</option>
                        {categoryOptions.map((v) => (
                          <option value={v} key={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.used_by}
                        onChange={(e) => updateFilter('used_by', e.target.value)}
                      >
                        <option value="">All</option>
                        {entities.map((e) => (
                          <option value={e.id} key={e.id}>
                            {shortProjectName(e.name)}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters.description}
                        onChange={(e) => updateFilter('description', e.target.value)}
                      />
                    </th>
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={editMode ? 10 : 9}>
                      {parts.length === 0 ? 'No parts yet.' : 'No parts match your filters.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((p, i) => (
                    <tr key={editMode ? p._tempId || p.gcs_id : p.gcs_id}>
                      <td className="row-head">{p._existing !== false ? p.gcs_id : 'new'}</td>
                      <td className="center-cell">{imageCell(p)}</td>
                      {editMode && !p._existing ? (
                        <>
                          <td>
                            <input
                              type="text"
                              value={p.gcs_part_id || ''}
                              onChange={(e) => updateDraftField(i, 'gcs_part_id', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={p.manufacturer_part_number || ''}
                              onChange={(e) => updateDraftField(i, 'manufacturer_part_number', e.target.value)}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{p.gcs_part_id}</td>
                          <td>{p.manufacturer_part_number || '—'}</td>
                        </>
                      )}
                      {editMode ? (
                        <>
                          <td>
                            <input
                              type="text"
                              list="manufacturer-options"
                              value={p.manufacturer || ''}
                              onChange={(e) => updateDraftField(i, 'manufacturer', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              list="category-options"
                              value={p.spare_category || ''}
                              onChange={(e) => updateDraftField(i, 'spare_category', e.target.value)}
                            />
                          </td>
                          <td title="Set by each entity's Required Inventory list">{usedByCell(p)}</td>
                          <td>
                            <input
                              type="text"
                              value={p.description || ''}
                              onChange={(e) => updateDraftField(i, 'description', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={p.last_cost ?? ''}
                              onChange={(e) => updateDraftField(i, 'last_cost', e.target.value)}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{p.manufacturer || '—'}</td>
                          <td>{p.spare_category || '—'}</td>
                          <td>{usedByCell(p)}</td>
                          <td>{p.description || '—'}</td>
                          <td>{p.last_cost != null ? `$${Number(p.last_cost).toFixed(2)}` : '—'}</td>
                        </>
                      )}
                      {editMode && (
                        <td className="col-last">
                          <button className="del-btn" onClick={() => removeDraftRow(i)}>
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onImageChosen} />

      {previewPart && (
        <div className="img-modal-backdrop" onClick={() => setPreviewPart(null)} role="dialog" aria-modal="true" aria-label="Part picture">
          <div className="img-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="img-modal-close" onClick={() => setPreviewPart(null)} aria-label="Close">
              ×
            </button>
            <img src={previewPart.image_url} alt={previewPart.gcs_part_id || `Part ${previewPart.gcs_id}`} />
            <div className="img-modal-caption">
              <strong>
                {previewPart.gcs_id} · {previewPart.gcs_part_id}
              </strong>
              {previewPart.description ? <div>{previewPart.description}</div> : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default MasterListTab
