import { emptyFilters } from '../utils'

function MasterListTab({
  locked,
  unlockPasswordInput,
  setUnlockPasswordInput,
  unlockError,
  handleUnlock,
  canEditInventory,
  manufacturerOptions,
  categoryOptions,
  whereUsedOptions,
  masterPanel,
  resetMasterPanel,
  editMode,
  requireAdmin,
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
}) {
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
      <datalist id="where-used-options">
        {whereUsedOptions.map((v) => (
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
            <button className="btn-primary" onClick={() => requireAdmin({ type: 'edit' })}>
              Edit List
            </button>
            <button className="btn-primary" onClick={() => requireAdmin({ type: 'export-parts' })}>
              Export List
            </button>
            <button className="btn-primary" onClick={() => requireAdmin({ type: 'import-parts' })}>
              Import List
            </button>
          </div>
        ) : (
          <div className="edit-toolbar">
            <button className="btn-primary" onClick={handleSaveEdits} disabled={locked || savingEdits}>
              {savingEdits ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn-secondary" onClick={addDraftRow} disabled={locked || savingEdits}>
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

      {canEditInventory && locked && editMode && (
        <div className="card">
          <form onSubmit={handleUnlock} className="edit-toolbar">
            <label htmlFor="admin_password" className="sub" style={{ margin: 0 }}>
              Enter the inventory password to edit these fields:
            </label>
            <input
              id="admin_password"
              type="password"
              autoFocus
              placeholder="Password"
              value={unlockPasswordInput}
              onChange={(e) => setUnlockPasswordInput(e.target.value)}
            />
            <button className="btn-primary" type="submit">
              Unlock
            </button>
            {unlockError && <div className="status err">{unlockError}</div>}
          </form>
        </div>
      )}

      {masterPanel === 'import' && (
        <div className="card">
          <div className="card-header">
            <h2>Import List</h2>
            <p className="sub" style={{ margin: 0 }}>
              CSV with columns: GCS P/N, Part ID, Mfr Part #, Manufacturer, Category, Where Used,
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
                <button className="btn-primary" onClick={handleConfirmImport} disabled={locked || importing}>
                  {importing ? 'Importing…' : `Confirm Import (${importPreview.rows.length} rows)`}
                </button>
              </div>
              {locked && (
                <form onSubmit={handleUnlock} className="edit-toolbar" style={{ marginTop: 12 }}>
                  <label htmlFor="admin_password" className="sub" style={{ margin: 0 }}>
                    Enter the inventory password to confirm this import:
                  </label>
                  <input
                    id="admin_password"
                    type="password"
                    placeholder="Password"
                    value={unlockPasswordInput}
                    onChange={(e) => setUnlockPasswordInput(e.target.value)}
                  />
                  <button className="btn-primary" type="submit">
                    Unlock
                  </button>
                  {unlockError && <div className="status err">{unlockError}</div>}
                </form>
              )}
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
          <fieldset disabled={locked && editMode} style={{ border: 0, margin: 0, padding: 0 }}>
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col className="col-rowhead" />
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
                  <th>Part ID</th>
                  <th>Mfr Part #</th>
                  <th>Manufacturer</th>
                  <th>Category</th>
                  <th>Where Used</th>
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
                        value={filters.where_used}
                        onChange={(e) => updateFilter('where_used', e.target.value)}
                      >
                        <option value="">All</option>
                        {whereUsedOptions.map((v) => (
                          <option value={v} key={v}>
                            {v}
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
                    <td className="empty" colSpan={editMode ? 9 : 8}>
                      {parts.length === 0 ? 'No parts yet.' : 'No parts match your filters.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((p, i) => (
                    <tr key={editMode ? p._tempId || p.gcs_id : p.gcs_id}>
                      <td className="row-head">{p._existing !== false ? p.gcs_id : 'new'}</td>
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
                          <td>
                            <input
                              type="text"
                              list="where-used-options"
                              value={p.where_used || ''}
                              onChange={(e) => updateDraftField(i, 'where_used', e.target.value)}
                            />
                          </td>
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
                          <td>{p.where_used || '—'}</td>
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
          </fieldset>
        )}
      </div>
      )}
    </>
  )
}

export default MasterListTab
