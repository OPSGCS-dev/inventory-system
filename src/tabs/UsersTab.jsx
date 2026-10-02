import { useState } from 'react'
import { PO_ROLE_OPTIONS, ENTITY_SCOPED_ROLES } from '../utils'

// Compact "add one at a time" control instead of a tall multi-select: a
// one-line dropdown + Add button, with already-assigned entities shown as
// small removable chips above it. Keeps each user's row short even when a
// couple of entities are assigned.
function EntityAssignmentCell({ projects, assignedIds, onAdd, onRemove }) {
  const [pendingId, setPendingId] = useState('')
  const available = projects.filter((p) => !assignedIds.includes(p.id))

  return (
    <div>
      {assignedIds.length === 0 ? (
        <span className="sub" style={{ margin: 0 }}>
          All entities
        </span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {assignedIds.map((id) => {
            const project = projects.find((p) => p.id === id)
            return (
              <span
                key={id}
                className="po-badge po-badge-issued"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {project?.name || id}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  title="Remove"
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'inherit',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={pendingId} onChange={(e) => setPendingId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Add entity…</option>
            {available.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={!pendingId}
            onClick={() => {
              onAdd(Number(pendingId))
              setPendingId('')
            }}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  )
}

function UsersTab({
  draftUsers,
  usersStatus,
  updateDraftUserField,
  toggleDraftUserRole,
  updateDraftUserEntityAssignment,
  savingUsers,
  handleSaveUsers,
  handleDeleteUser,
  inviteEmail,
  setInviteEmail,
  inviteRoles,
  toggleInviteRole,
  inviting,
  handleInviteUser,
  invitePassword,
  draftBudgetCategories,
  addDraftBudgetCategoryRow,
  removeDraftBudgetCategoryRow,
  updateDraftBudgetCategoryField,
  savingBudgetCategories,
  handleSaveBudgetCategories,
  draftBudgetSubcategories,
  addDraftBudgetSubcategoryRow,
  removeDraftBudgetSubcategoryRow,
  updateDraftBudgetSubcategoryField,
  savingBudgetSubcategories,
  handleSaveBudgetSubcategories,
  vendors,
  showVendorForm,
  editingVendorId,
  openNewVendorForm,
  openEditVendorForm,
  closeVendorForm,
  vendorFormName,
  setVendorFormName,
  vendorFormContact,
  setVendorFormContact,
  vendorFormPhone,
  setVendorFormPhone,
  vendorFormEmail,
  setVendorFormEmail,
  vendorFormAddress,
  setVendorFormAddress,
  vendorFormNotes,
  setVendorFormNotes,
  savingVendor,
  handleSaveVendor,
  handleUpdateVendorLogon,
  projects,
  newProjectName,
  setNewProjectName,
  addingProject,
  handleAddProject,
  handleUpdateProjectCode,
  draftSubProjects,
  addDraftSubProjectRow,
  removeDraftSubProjectRow,
  updateDraftSubProjectField,
  savingSubProjects,
  handleSaveSubProjects,
  handleExportAdminData,
  adminImportPanelOpen,
  setAdminImportPanelOpen,
  adminImportFileName,
  adminImportPreview,
  adminImportErrors,
  handleAdminImportFileChange,
  adminImporting,
  handleConfirmAdminImport,
  resetAdminImportPanel,
}) {
  const [passwordCopied, setPasswordCopied] = useState(false)

  async function copyInvitePassword() {
    try {
      await navigator.clipboard.writeText(invitePassword)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) -- it's still
      // selectable/copyable by hand from the text box.
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Admin Data</h2>
        </div>

        <div className="edit-toolbar">
          <button className="btn-secondary" onClick={handleExportAdminData}>
            Export All (Excel)
          </button>
          <button
            className="btn-secondary"
            onClick={() => (adminImportPanelOpen ? resetAdminImportPanel() : setAdminImportPanelOpen(true))}
          >
            {adminImportPanelOpen ? 'Cancel Import' : 'Import All (Excel)'}
          </button>
        </div>

        {adminImportPanelOpen && (
          <div style={{ marginTop: 12 }}>
            <p className="sub" style={{ margin: '0 0 8px' }}>
              Excel file with one worksheet per category — Users, Vendors, Entities, Projects, Budget
              Categories, Budget Sub-Categories — matching the file from "Export All (Excel)". Rows
              matching an existing name update it; anything else is added. New users aren't created
              this way — invite them from the Users section above instead, then re-import to set roles.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleAdminImportFileChange} />
            {adminImportErrors.length > 0 && (
              <div className="status err" style={{ marginTop: 12 }}>
                {adminImportErrors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {adminImportPreview && (
              <>
                <div className="sheet-wrap" style={{ marginTop: 12 }}>
                  <table className="sheet">
                    <colgroup>
                      <col className="col-rowhead" />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '16%' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="header-row">
                        <th className="row-head">#</th>
                        <th>Section</th>
                        <th>Action</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminImportPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="row-head">{i + 1}</td>
                          <td>{r.section}</td>
                          <td>{r.action === 'insert' ? 'Add new' : 'Update'}</td>
                          <td>{r.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="edit-toolbar" style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={handleConfirmAdminImport} disabled={adminImporting}>
                    {adminImporting
                      ? 'Importing…'
                      : `Confirm Import (${adminImportPreview.rows.length} rows)`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Users {draftUsers.length ? `(${draftUsers.length})` : ''}</h2>
        </div>

        {usersStatus && <div className={'status ' + (usersStatus.ok ? 'ok' : 'err')}>{usersStatus.msg}</div>}

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '22%' }} />
              {PO_ROLE_OPTIONS.map((r) => (
                <col style={{ width: '8%' }} key={r.value} />
              ))}
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Email</th>
                {PO_ROLE_OPTIONS.map((r) => (
                  <th className="center-cell" key={r.value}>
                    {r.label}
                  </th>
                ))}
                <th className="center-cell">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draftUsers.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={PO_ROLE_OPTIONS.length + 3}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                draftUsers.map((u, i) => (
                  <tr key={u.id}>
                    <td>
                      {u.name}
                      {!u.activated_at && (
                        <span
                          className="sub"
                          style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                          title="Still using the temporary password an admin set -- hasn't changed it themselves yet."
                        >
                          (temp password)
                        </span>
                      )}
                    </td>
                    {PO_ROLE_OPTIONS.map((r) => (
                      <td className="center-cell" key={r.value}>
                        <input
                          type="checkbox"
                          checked={(u.roles || []).includes(r.value)}
                          onChange={() => toggleDraftUserRole(i, r.value)}
                        />
                      </td>
                    ))}
                    <td className="center-cell">
                      <input
                        type="checkbox"
                        checked={Boolean(u.active)}
                        onChange={(e) => updateDraftUserField(i, 'active', e.target.checked)}
                      />
                    </td>
                    <td className="center-cell">
                      <button className="del-btn" onClick={() => handleDeleteUser(u)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleSaveUsers} disabled={savingUsers}>
            {savingUsers ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="add-form" style={{ marginTop: 16 }}>
          <label htmlFor="invite_email">
            Invite New User (or reset an existing one's password) — creates a working temporary
            password immediately, no link or email involved
          </label>
          <input
            id="invite_email"
            type="email"
            placeholder="name@greatcirclesolar.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <div className="field-row" style={{ flexWrap: 'wrap', gap: '4px 16px' }}>
            {PO_ROLE_OPTIONS.map((r) => (
              <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={inviteRoles.includes(r.value)}
                  onChange={() => toggleInviteRole(r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleInviteUser} disabled={inviting}>
              {inviting ? 'Creating…' : 'Create Account / Reset Password'}
            </button>
          </div>

          {invitePassword && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="invite_password">
                Temporary password — safe to paste into Teams, Outlook, anywhere. They can log in
                with it right away and change it anytime from Change Password.
              </label>
              <div className="field-row" style={{ alignItems: 'center' }}>
                <input
                  id="invite_password"
                  type="text"
                  readOnly
                  value={invitePassword}
                  onFocus={(e) => e.target.select()}
                />
                <button className="btn-secondary" onClick={copyInvitePassword} type="button">
                  {passwordCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Entity Assignments</h2>
        </div>
        <p className="sub" style={{ margin: '0 0 12px' }}>
          Limits what a Purchase Rec Approval / PO Issue holder sees to specific entities. Leave an
          entity list empty to see every entity — the default. Saved together with the Users table
          above (Save button there).
        </p>

        {ENTITY_SCOPED_ROLES.map((role) => {
          const label = PO_ROLE_OPTIONS.find((r) => r.value === role)?.label || role
          const rows = draftUsers
            .map((u, i) => ({ u, i }))
            .filter(({ u }) => (u.roles || []).includes(role))
          return (
            <div key={role} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{label}</h3>
              {rows.length === 0 ? (
                <p className="sub" style={{ margin: 0 }}>
                  Nobody holds this role yet.
                </p>
              ) : (
                <div className="sheet-wrap">
                  <table className="sheet">
                    <colgroup>
                      <col style={{ width: '30%' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="header-row">
                        <th>Email</th>
                        <th>Entities (none selected = all)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ u, i }) => {
                        const assignedIds = u.entityAssignments?.[role] || []
                        return (
                          <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>
                              <EntityAssignmentCell
                                projects={projects}
                                assignedIds={assignedIds}
                                onAdd={(projectId) =>
                                  updateDraftUserEntityAssignment(i, role, [...assignedIds, projectId])
                                }
                                onRemove={(projectId) =>
                                  updateDraftUserEntityAssignment(
                                    i,
                                    role,
                                    assignedIds.filter((id) => id !== projectId)
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Budget Categories {draftBudgetCategories.length ? `(${draftBudgetCategories.length})` : ''}</h2>
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Name</th>
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftBudgetCategories.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={2}>
                    No budget categories yet.
                  </td>
                </tr>
              ) : (
                draftBudgetCategories.map((c, i) => (
                  <tr key={c._existing ? c.id : c._tempId}>
                    <td>
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateDraftBudgetCategoryField(i, 'name', e.target.value)}
                      />
                    </td>
                    <td className="col-last">
                      {!c._existing && (
                        <button className="del-btn" onClick={() => removeDraftBudgetCategoryRow(i)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleSaveBudgetCategories} disabled={savingBudgetCategories}>
            {savingBudgetCategories ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-secondary" onClick={addDraftBudgetCategoryRow} disabled={savingBudgetCategories}>
            + Add Category
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>
            Budget Sub-Categories {draftBudgetSubcategories.length ? `(${draftBudgetSubcategories.length})` : ''}
          </h2>
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Budget Category</th>
                <th>Name</th>
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftBudgetSubcategories.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={3}>
                    No sub-categories yet.
                  </td>
                </tr>
              ) : (
                draftBudgetSubcategories.map((c, i) => (
                  <tr key={c._existing ? c.id : c._tempId}>
                    <td>
                      <select
                        value={c.category_id ?? ''}
                        onChange={(e) =>
                          updateDraftBudgetSubcategoryField(i, 'category_id', Number(e.target.value))
                        }
                      >
                        {draftBudgetCategories
                          .filter((cat) => cat._existing)
                          .map((cat) => (
                            <option value={cat.id} key={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateDraftBudgetSubcategoryField(i, 'name', e.target.value)}
                      />
                    </td>
                    <td className="col-last">
                      {!c._existing && (
                        <button className="del-btn" onClick={() => removeDraftBudgetSubcategoryRow(i)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button
            className="btn-primary"
            onClick={handleSaveBudgetSubcategories}
            disabled={savingBudgetSubcategories}
          >
            {savingBudgetSubcategories ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-secondary"
            onClick={addDraftBudgetSubcategoryRow}
            disabled={savingBudgetSubcategories}
          >
            + Add Sub-Category
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Vendors {vendors.length ? `(${vendors.length})` : ''}</h2>
        </div>

        {showVendorForm && (
          <div className="add-form" style={{ marginBottom: 16 }}>
            <label htmlFor="vendor_form_name">Vendor Name</label>
            <input
              id="vendor_form_name"
              type="text"
              value={vendorFormName}
              onChange={(e) => setVendorFormName(e.target.value)}
            />
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_contact">Contact Name</label>
                <input
                  id="vendor_form_contact"
                  type="text"
                  value={vendorFormContact}
                  onChange={(e) => setVendorFormContact(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="vendor_form_phone">Phone</label>
                <input
                  id="vendor_form_phone"
                  type="text"
                  value={vendorFormPhone}
                  onChange={(e) => setVendorFormPhone(e.target.value)}
                />
              </div>
            </div>
            <label htmlFor="vendor_form_email">Email</label>
            <input
              id="vendor_form_email"
              type="text"
              value={vendorFormEmail}
              onChange={(e) => setVendorFormEmail(e.target.value)}
            />
            <label htmlFor="vendor_form_address">Address</label>
            <input
              id="vendor_form_address"
              type="text"
              value={vendorFormAddress}
              onChange={(e) => setVendorFormAddress(e.target.value)}
            />
            <label htmlFor="vendor_form_notes">Notes</label>
            <input
              id="vendor_form_notes"
              type="text"
              value={vendorFormNotes}
              onChange={(e) => setVendorFormNotes(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn-primary" onClick={handleSaveVendor} disabled={savingVendor}>
                {savingVendor ? 'Saving…' : editingVendorId ? 'Save Changes' : 'Add Vendor'}
              </button>
              <button className="btn-secondary" onClick={closeVendorForm} disabled={savingVendor}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Name</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="center-cell">Logon</th>
                <th>Address</th>
                <th>Notes</th>
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={8}>
                    No vendors yet.
                  </td>
                </tr>
              ) : (
                vendors.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.name}
                      {v.approval_status === 'pending' && <div className="sub">Pending approval</div>}
                      {v.approval_status === 'rejected' && (
                        <div className="sub" style={{ color: 'var(--danger)' }}>
                          Rejected{v.rejection_reason ? ` — ${v.rejection_reason}` : ''}
                        </div>
                      )}
                    </td>
                    <td>{v.contact_name || '—'}</td>
                    <td>{v.phone || '—'}</td>
                    <td>{v.email || '—'}</td>
                    <td className="center-cell">
                      <input
                        type="checkbox"
                        checked={Boolean(v.logon_enabled)}
                        onChange={(e) => handleUpdateVendorLogon(v, { logon_enabled: e.target.checked })}
                      />
                    </td>
                    <td>{v.address || '—'}</td>
                    <td>{v.notes || '—'}</td>
                    <td className="col-last">
                      <button className="btn-secondary" onClick={() => openEditVendorForm(v)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!showVendorForm && (
          <div className="edit-toolbar" style={{ marginTop: 12 }}>
            <button className="btn-secondary" onClick={openNewVendorForm}>
              + Add Vendor
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Entities {projects.length ? `(${projects.length})` : ''}</h2>
        </div>

        <div className="add-form" style={{ marginBottom: 16 }}>
          <label htmlFor="new_project_name">Entity Name</label>
          <div className="field-row">
            <input
              id="new_project_name"
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleAddProject} disabled={addingProject}>
              {addingProject ? 'Adding…' : '+ Add Entity'}
            </button>
          </div>
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Name</th>
                <th>PO Code</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={2}>
                    No entities yet.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="center-cell">
                      <input
                        type="text"
                        defaultValue={p.project_code || ''}
                        onBlur={(e) => {
                          if (e.target.value !== (p.project_code || '')) {
                            handleUpdateProjectCode(p.id, e.target.value)
                          }
                        }}
                        style={{ width: 60, textAlign: 'center' }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Projects {draftSubProjects.length ? `(${draftSubProjects.length})` : ''}</h2>
          <p className="sub" style={{ margin: 0 }}>
            Individual sites within an Entity (e.g. Firelight Solar LP's rooftop sites) — only used
            when creating Purchase Requests. Spares inventory stays tracked at the Entity level.
          </p>
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Entity</th>
                <th>Name</th>
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftSubProjects.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={3}>
                    No projects yet.
                  </td>
                </tr>
              ) : (
                draftSubProjects.map((sp, i) => (
                  <tr key={sp._existing ? sp.id : sp._tempId}>
                    <td>
                      <select
                        value={sp.project_id ?? ''}
                        onChange={(e) =>
                          updateDraftSubProjectField(i, 'project_id', Number(e.target.value))
                        }
                      >
                        {projects.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={sp.name}
                        onChange={(e) => updateDraftSubProjectField(i, 'name', e.target.value)}
                      />
                    </td>
                    <td className="col-last">
                      {!sp._existing && (
                        <button className="del-btn" onClick={() => removeDraftSubProjectRow(i)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="edit-toolbar" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleSaveSubProjects} disabled={savingSubProjects}>
            {savingSubProjects ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-secondary"
            onClick={addDraftSubProjectRow}
            disabled={savingSubProjects}
          >
            + Add Project
          </button>
        </div>
      </div>
    </>
  )
}

export default UsersTab
