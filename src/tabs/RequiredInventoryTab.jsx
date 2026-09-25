function RequiredInventoryTab({
  pendingAction,
  canEditInventory,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  projectEditMode,
  requireAdmin,
  savingProjectEdits,
  handleSaveProjectEdits,
  projectEditFilter,
  setProjectEditFilter,
  handleCancelProjectEdits,
  projectStatus,
  projectLoading,
  visibleProjectItems,
  projectViewFilter,
  setProjectViewFilter,
  gcsIdOptions,
  visibleDraftProjectItems,
  draftProjectItems,
  updateProjectRequired,
  updateProjectDraftField,
}) {
  return (
    <>
      {!pendingAction && (
      <div className="card">
        <div className="project-row">
          <div className="project-select-wrap">
            <label htmlFor="project_select" className="project-select-label">
              Entity
            </label>
            <select
              id="project_select"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              disabled={projectEditMode}
            >
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {!projectEditMode ? (
            canEditInventory && (
              <div className="edit-toolbar">
                <button
                  className="btn-primary"
                  onClick={() => requireAdmin({ type: 'project-edit' })}
                  disabled={!selectedProjectId}
                >
                  Edit List
                </button>
              </div>
            )
          ) : (
            <div className="edit-toolbar">
              <button className="btn-primary" onClick={handleSaveProjectEdits} disabled={savingProjectEdits}>
                {savingProjectEdits ? 'Saving…' : 'Save Changes'}
              </button>
              <input
                type="text"
                placeholder="Search parts to narrow the list..."
                value={projectEditFilter}
                onChange={(e) => setProjectEditFilter(e.target.value)}
              />
              <button
                className="btn-secondary"
                onClick={handleCancelProjectEdits}
                disabled={savingProjectEdits}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {projectStatus && (
          <div className={'status ' + (projectStatus.ok ? 'ok' : 'err')}>{projectStatus.msg}</div>
        )}
      </div>
      )}

      {!projectEditMode ? (
        <div className="card">
          <div className="card-header">
            <h2>Required Parts {projectLoading ? '' : `(${visibleProjectItems.length})`}</h2>
          </div>

          {projectLoading ? (
            <div className="empty">Loading...</div>
          ) : (
            <div className="sheet-wrap">
              <table className="sheet">
                <colgroup>
                  <col className="col-rowhead" />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '14%' }} />
                  <col />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th className="row-head">GCS P/N</th>
                    <th>Part ID</th>
                    <th>Manufacturer</th>
                    <th>Description</th>
                    <th className="center-cell">Target Stock</th>
                    <th className="center-cell">Shared</th>
                  </tr>
                  <tr className="filter-row">
                    <th className="row-head">
                      <select
                        value={projectViewFilter}
                        onChange={(e) => setProjectViewFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        {gcsIdOptions.map((id) => (
                          <option value={id} key={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th colSpan={5}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjectItems.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={6}>
                        {projectViewFilter
                          ? 'No parts match your filter.'
                          : 'No required parts yet for this entity.'}
                      </td>
                    </tr>
                  ) : (
                    visibleProjectItems.map((item) => (
                      <tr key={item.id}>
                        <td className="row-head">{item.parts?.gcs_id}</td>
                        <td>{item.parts?.gcs_part_id}</td>
                        <td>{item.parts?.manufacturer || '—'}</td>
                        <td>{item.parts?.description || '—'}</td>
                        <td className="center-cell">{item.target_stock ?? '—'}</td>
                        <td className="center-cell">
                          {item.shared ? (
                            <input type="radio" className="avail-dot" checked readOnly disabled />
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>
              All Parts ({visibleDraftProjectItems.length}
              {projectEditFilter ? ` of ${draftProjectItems.length}` : ''})
            </h2>
            <p className="sub" style={{ margin: 0 }}>
              Check a part as required and set the target stock level. Mark Shared if this
              entity's need can be met from its own stock, another entity's stock, or FLOPS —
              unshared rows only count stock physically at this entity. Only unshared rows count
              toward the total Target shown on Inventory On Hand.
            </p>
          </div>

          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col className="col-rowhead" />
                <col style={{ width: '13%' }} />
                <col style={{ width: '12%' }} />
                <col />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">GCS P/N</th>
                  <th>Part ID</th>
                  <th>Manufacturer</th>
                  <th>Description</th>
                  <th className="center-cell">Required</th>
                  <th className="center-cell">Target Stock</th>
                  <th className="center-cell">Shared</th>
                </tr>
              </thead>
              <tbody>
                {visibleDraftProjectItems.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={7}>
                      No parts match your search.
                    </td>
                  </tr>
                ) : (
                  visibleDraftProjectItems.map((row) => {
                    const i = draftProjectItems.indexOf(row)
                    return (
                      <tr key={row.gcs_id}>
                        <td className="row-head">{row.gcs_id}</td>
                        <td>{row.part.gcs_part_id}</td>
                        <td>{row.part.manufacturer || '—'}</td>
                        <td>{row.part.description || '—'}</td>
                        <td className="center-cell">
                          <input
                            type="checkbox"
                            checked={row.required}
                            onChange={(e) => updateProjectRequired(i, e.target.checked)}
                          />
                        </td>
                        <td className="center-cell">
                          <input
                            type="number"
                            min="0"
                            disabled={!row.required}
                            value={row.target_stock}
                            onChange={(e) => updateProjectDraftField(i, 'target_stock', e.target.value)}
                          />
                        </td>
                        <td className="center-cell">
                          <input
                            type="checkbox"
                            className="avail-dot"
                            disabled={!row.required}
                            checked={row.shared}
                            onChange={(e) => updateProjectDraftField(i, 'shared', e.target.checked)}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export default RequiredInventoryTab
