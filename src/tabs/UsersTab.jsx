import { useEffect, useState } from 'react'
import { PO_ROLE_OPTIONS, ENTITY_SCOPED_ROLES, userDisplayName, programLabel } from '../utils'
import { vendorAddressLines } from '../vendorFields'

// Admin > Sites: the other entities a site is also available to on a PO (a closed list of checkboxes under a summary).
function AlsoEntitiesPicker({ site, entities, onChange }) {
  const chosen = (site.also_project_ids || []).filter((id) => id !== site.project_id)
  const names = entities.filter((p) => chosen.includes(p.id)).map((p) => p.name)
  return (
    <details>
      <summary style={{ cursor: 'pointer' }}>
        {names.length === 0 ? <span className="sub">None</span> : names.length <= 2 ? names.join(', ') : `${names.length} entities`}
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
        {entities
          .filter((p) => p.id !== site.project_id)
          .map((p) => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontWeight: 'normal' }}>
              <input
                type="checkbox"
                checked={chosen.includes(p.id)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, p.id] : chosen.filter((id) => id !== p.id))}
              />
              {p.name}
            </label>
          ))}
      </div>
    </details>
  )
}

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
  inviteName,
  setInviteName,
  inviteRoles,
  toggleInviteRole,
  inviting,
  handleInviteUser,
  invitePassword,
  draftBudgetCategories,
  addDraftBudgetCategoryRow,
  removeDraftBudgetCategoryRow,
  handleDeleteBudgetCategory,
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
  handleDeleteVendor,
  handleSetVendorActive,
  closeVendorForm,
  vendorForm,
  setVendorFormField,
  vendorDetailsReady,
  savingVendor,
  handleSaveVendor,
  handleUpdateVendorLogon,
  handleResetVendorPassword,
  vendorLogonInfo,
  dismissVendorLogonInfo,
  projects,
  programs,
  programSiteIds,
  newProjectPrograms,
  setNewProjectPrograms,
  handleUpdateProgram,
  handleSetProgramSite,
  newProjectName,
  setNewProjectName,
  addingProject,
  handleAddProject,
  handleUpdateProjectCode,
  handleUpdateProjectNoSite,
  handleUpdateProjectCanRebill,
  draftSubProjects,
  addDraftSubProjectRow,
  removeDraftSubProjectRow,
  updateDraftSubProjectField,
  siteExtraEntitiesReady,
  makeAllSitesAvailableTo,
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
  consumableCap,
  savingSettings,
  settingsStatus,
  handleSaveConsumableCap,
}) {
  const [capDraft, setCapDraft] = useState(String(consumableCap))
  useEffect(() => {
    setCapDraft(String(consumableCap))
  }, [consumableCap])
  const capChanged = capDraft.trim() !== String(consumableCap)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [vendorPasswordCopied, setVendorPasswordCopied] = useState(false)
  const [vendorSearch, setVendorSearch] = useState('')
  const [shareEntityId, setShareEntityId] = useState('')

  async function copyVendorPassword() {
    try {
      await navigator.clipboard.writeText(vendorLogonInfo.password)
      setVendorPasswordCopied(true)
      setTimeout(() => setVendorPasswordCopied(false), 2000)
    } catch {
      // Clipboard API unavailable -- the text box below is still selectable.
    }
  }

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

  // The vendor list, narrowed by the search box: every word has to appear somewhere in the vendor's details.
  const vendorWords = vendorSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shownVendors =
    vendorWords.length === 0
      ? vendors
      : vendors.filter((v) => {
          const haystack = [v.name, v.legal_name, v.vendor_code, v.contact_name, v.email, v.alt_email, v.phone, v.mobile, v.city, v.notes]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return vendorWords.every((w) => haystack.includes(w))
        })

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
              Excel file with one worksheet per category — Users, Vendors, Entities, Sites, Budget
              Categories, Budget Sub-Categories — matching the file from "Export All (Excel)". Rows
              matching an existing name update it; anything else is added. On Vendors, a blank cell leaves what is stored as it is. New users aren't created
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
                      <col style={{ width: '30%' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="header-row">
                        <th className="row-head">#</th>
                        <th>Section</th>
                        <th>Action</th>
                        <th>Name</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminImportPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="row-head">{i + 1}</td>
                          <td>{r.section}</td>
                          <td>{r.action === 'insert' ? 'Add new' : 'Update'}</td>
                          <td>{r.name}</td>
                          <td className="sub">{r.note || ''}</td>
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
          <h2>Settings</h2>
        </div>

        <div className="edit-toolbar" style={{ alignItems: 'center' }}>
          <label htmlFor="consumable-cap" style={{ fontWeight: 600 }}>
            Consumable limit ($ per unit)
          </label>
          <input
            id="consumable-cap"
            type="number"
            min="0"
            step="1"
            style={{ width: 120 }}
            value={capDraft}
            onChange={(e) => setCapDraft(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={savingSettings || !capChanged}
            onClick={() => handleSaveConsumableCap(capDraft)}
          >
            {savingSettings ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="sub" style={{ margin: '8px 0 0' }}>
          The most a single consumable can cost on a purchase request. Anything dearer has to be an
          inventory part from the list, or go in a service line. Lines already saved are not changed;
          the new limit applies to lines saved from now on.
        </p>
        {settingsStatus && <div className={'status ' + (settingsStatus.ok ? 'ok' : 'err')}>{settingsStatus.msg}</div>}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Users {draftUsers.length ? `(${draftUsers.length})` : ''}</h2>
        </div>

        {usersStatus && <div className={'status ' + (usersStatus.ok ? 'ok' : 'err')}>{usersStatus.msg}</div>}

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              {PO_ROLE_OPTIONS.map((r) => (
                <col style={{ width: '7%' }} key={r.value} />
              ))}
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Name</th>
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
                  <td className="empty" colSpan={PO_ROLE_OPTIONS.length + 4}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                draftUsers.map((u, i) => (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="text"
                        placeholder="Name…"
                        value={u.display_name || ''}
                        onChange={(e) => updateDraftUserField(i, 'display_name', e.target.value)}
                        aria-label={`Name for ${u.name}`}
                      />
                    </td>
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
          <label htmlFor="invite_name" style={{ marginTop: 8 }}>
            Name (optional — shown instead of the email wherever they appear)
          </label>
          <input
            id="invite_name"
            type="text"
            placeholder="Jane Smith"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
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
          Limits each step of the PO process (creating requests, approving them, issuing POs,
          matching invoices, approving invoices and payment) to specific entities for the people
          holding that role. Leave a person's entity list empty to allow every entity — the
          default. Saved together with the Users table above (Save button there).
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
                        <th>Person</th>
                        <th>Entities (none selected = all)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ u, i }) => {
                        const assignedIds = u.entityAssignments?.[role] || []
                        return (
                          <tr key={u.id}>
                            <td>
                              {userDisplayName(u)}
                              {u.display_name ? <div className="sub">{u.name}</div> : null}
                            </td>
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

      {programs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Budget Types ({programs.length})</h2>
            <p className="sub" style={{ margin: 0 }}>
              The top layer: every PO belongs to a budget type. Each budget type has its own entities, its own budget
              categories and sub-categories (below) and the email address vendors send invoices to; a PO can only use
              the entities and categories of its budget type. Spare-parts inventory is only kept for the entities of a
              budget type marked "Keeps inventory". A retired budget type is not offered on new POs but keeps the POs and
              budget already on it. Changes here save as you make them.
            </p>
          </div>
          {programs.map((g) => {
            const siteIds = programSiteIds?.get(g.id) || new Set()
            const inProject = projects.filter((p) => siteIds.has(p.id))
            const notIn = projects.filter((p) => !siteIds.has(p.id))
            return (
              <div key={g.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
                <div className="field-row">
                  <div>
                    <label htmlFor={`program_name_${g.id}`}>Budget type name</label>
                    <input
                      id={`program_name_${g.id}`}
                      type="text"
                      defaultValue={g.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== g.name) handleUpdateProgram(g.id, { name: v })
                        else e.target.value = g.name
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor={`program_email_${g.id}`}>Send invoices to</label>
                    <input
                      id={`program_email_${g.id}`}
                      type="text"
                      defaultValue={g.invoice_email || ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (g.invoice_email || '')) handleUpdateProgram(g.id, { invoice_email: v || null })
                      }}
                    />
                  </div>
                  <div>
                    <label>Keeps inventory</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(g.tracks_inventory)}
                        onChange={(e) => handleUpdateProgram(g.id, { tracks_inventory: e.target.checked })}
                        aria-label={`${g.name} keeps inventory`}
                      />
                      <span className="sub" style={{ margin: 0 }}>
                        Its entities appear on the inventory screens
                      </span>
                    </div>
                  </div>
                  {'active' in g && (
                    <div>
                      <label>Active</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 }}>
                        <input
                          type="checkbox"
                          checked={g.active !== false}
                          onChange={(e) => handleUpdateProgram(g.id, { active: e.target.checked })}
                          aria-label={`${g.name} is active`}
                        />
                        <span className="sub" style={{ margin: 0 }}>
                          Untick to retire it (hidden on new POs)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className="sub" style={{ margin: 0 }}>
                    Entities ({inProject.length})
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                    {inProject.length === 0 && (
                      <span className="sub" style={{ margin: 0 }}>
                        None yet.
                      </span>
                    )}
                    {inProject.map((p) => (
                      <span key={p.id} className="po-badge po-badge-issued" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {p.name}
                        <button
                          type="button"
                          onClick={() => handleSetProgramSite(g.id, p.id, false)}
                          title={`Take ${p.name} out of ${g.name}`}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontWeight: 700, lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {notIn.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && handleSetProgramSite(g.id, Number(e.target.value), true)}
                      style={{ maxWidth: 280 }}
                      aria-label={`Add an entity to ${g.name}`}
                    >
                      <option value="">Add an entity…</option>
                      {notIn.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Budget Categories {draftBudgetCategories.length ? `(${draftBudgetCategories.length})` : ''}</h2>
          {programs.length > 0 && (
            <p className="sub" style={{ margin: 0 }}>
              Each budget type has its own list; a PO can only use the categories of its budget type. A retired category
              is hidden on new POs but stays on the POs that have it. "Re-bills" marks a category (the O&M Overage ones)
              whose POs, when issued by an entity that can re-bill (FLOPS), are re-billed to another entity. Save after
              changing either.
            </p>
          )}
        </div>

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              {programs.length > 0 && <col style={{ width: '30%' }} />}
              <col />
              {draftBudgetCategories.some((c) => 'rebills' in c) && <col style={{ width: '90px' }} />}
              {draftBudgetCategories.some((c) => 'active' in c) && <col style={{ width: '90px' }} />}
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                {programs.length > 0 && <th>Budget Type</th>}
                <th>Name</th>
                {draftBudgetCategories.some((c) => 'rebills' in c) && <th title="POs from an entity that can re-bill are re-billed to another entity">Re-bills</th>}
                {draftBudgetCategories.some((c) => 'active' in c) && <th title="Untick to retire: hidden on new POs">Active</th>}
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftBudgetCategories.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={programs.length > 0 ? 5 : 4}>
                    No budget categories yet.
                  </td>
                </tr>
              ) : (
                [...draftBudgetCategories]
                  .map((c, i) => ({ c, i }))
                  .sort((a, b) => {
                    const pa = programs.findIndex((g) => g.id === a.c.program_id)
                    const pb = programs.findIndex((g) => g.id === b.c.program_id)
                    return pa === pb ? a.i - b.i : pa - pb
                  })
                  .map(({ c, i }) => (
                  <tr key={c._existing ? c.id : c._tempId}>
                    {programs.length > 0 && (
                      <td>
                        {c._existing ? (
                          programLabel(programs.find((g) => g.id === c.program_id)) || '—'
                        ) : (
                          <select
                            value={c.program_id ?? ''}
                            onChange={(e) => updateDraftBudgetCategoryField(i, 'program_id', Number(e.target.value))}
                          >
                            {programs.filter((g) => g.active !== false).map((g) => (
                              <option value={g.id} key={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    )}
                    <td>
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateDraftBudgetCategoryField(i, 'name', e.target.value)}
                      />
                    </td>
                    {draftBudgetCategories.some((x) => 'rebills' in x) && (
                      <td className="center-cell">
                        {c._existing && !('rebills' in c) ? null : (
                          <input
                            type="checkbox"
                            checked={Boolean(c.rebills)}
                            onChange={(e) => updateDraftBudgetCategoryField(i, 'rebills', e.target.checked)}
                            aria-label={`${c.name} is re-billed`}
                          />
                        )}
                      </td>
                    )}
                    {draftBudgetCategories.some((x) => 'active' in x) && (
                      <td className="center-cell">
                        {c._existing && !('active' in c) ? null : (
                          <input
                            type="checkbox"
                            checked={c.active !== false}
                            onChange={(e) => updateDraftBudgetCategoryField(i, 'active', e.target.checked)}
                            aria-label={`${c.name} is active`}
                          />
                        )}
                      </td>
                    )}
                    <td className="col-last">
                      {c._existing ? (
                        <button className="del-btn" onClick={() => handleDeleteBudgetCategory(c)}>
                          Delete
                        </button>
                      ) : (
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
              <col style={{ width: '38%' }} />
              <col />
              {draftBudgetSubcategories.some((c) => 'active' in c) && <col style={{ width: '90px' }} />}
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Budget Category</th>
                <th>Name</th>
                {draftBudgetSubcategories.some((c) => 'active' in c) && <th title="Untick to retire: hidden on new POs">Active</th>}
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftBudgetSubcategories.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={4}>
                    No sub-categories yet.
                  </td>
                </tr>
              ) : (
                [...draftBudgetSubcategories]
                  .map((c, i) => ({ c, i }))
                  .sort((a, b) => {
                    // Grouped by budget type and category, in the order they were entered.
                    const catA = draftBudgetCategories.find((x) => x._existing && x.id === a.c.category_id)
                    const catB = draftBudgetCategories.find((x) => x._existing && x.id === b.c.category_id)
                    const pa = programs.findIndex((g) => g.id === catA?.program_id)
                    const pb = programs.findIndex((g) => g.id === catB?.program_id)
                    if (pa !== pb) return pa - pb
                    if (a.c.category_id !== b.c.category_id) return (a.c.category_id || 0) - (b.c.category_id || 0)
                    return a.i - b.i
                  })
                  .map(({ c, i }) => (
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
                              {programs.length > 0 ? `${programLabel(programs.find((g) => g.id === cat.program_id))} — ` : ''}
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
                    {draftBudgetSubcategories.some((x) => 'active' in x) && (
                      <td className="center-cell">
                        {c._existing && !('active' in c) ? null : (
                          <input
                            type="checkbox"
                            checked={c.active !== false}
                            onChange={(e) => updateDraftBudgetSubcategoryField(i, 'active', e.target.checked)}
                            aria-label={`${c.name} is active`}
                          />
                        )}
                      </td>
                    )}
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

        {vendorLogonInfo && (
          <div className="add-form" style={{ marginBottom: 16 }}>
            <label htmlFor="vendor_logon_password">
              Login for {vendorLogonInfo.vendorName} ({vendorLogonInfo.email}). No email is sent, so send them this
              temporary password yourself. They can log in with it right away and change it from Change Password.
            </label>
            <div className="field-row" style={{ alignItems: 'center' }}>
              <input
                id="vendor_logon_password"
                type="text"
                readOnly
                value={vendorLogonInfo.password}
                onFocus={(e) => e.target.select()}
              />
              <button className="btn-secondary" onClick={copyVendorPassword} type="button">
                {vendorPasswordCopied ? 'Copied!' : 'Copy'}
              </button>
              <button className="btn-secondary" onClick={dismissVendorLogonInfo} type="button">
                Hide
              </button>
            </div>
          </div>
        )}

        {showVendorForm && (
          <div className="add-form" style={{ marginBottom: 16 }}>
            {!vendorDetailsReady && (
              <p className="sub" style={{ margin: '0 0 8px', color: 'var(--warn)' }}>
                Vendor ID, legal name, mobile, alt email, website and the address parts need supabase/add_vendor_details.sql to be run first.
                Until then only the older fields are saved (the address is kept as one block of text).
              </p>
            )}
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_name">Vendor Name</label>
                <input id="vendor_form_name" type="text" value={vendorForm.name} onChange={(e) => setVendorFormField('name', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_code">Vendor ID</label>
                <input id="vendor_form_code" type="text" value={vendorForm.code} onChange={(e) => setVendorFormField('code', e.target.value)} />
              </div>
            </div>
            <label htmlFor="vendor_form_legal">Legal Name (as it should read on the PO)</label>
            <input id="vendor_form_legal" type="text" value={vendorForm.legal} onChange={(e) => setVendorFormField('legal', e.target.value)} />
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_contact">Contact Name</label>
                <input id="vendor_form_contact" type="text" value={vendorForm.contact} onChange={(e) => setVendorFormField('contact', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_website">Website</label>
                <input id="vendor_form_website" type="text" value={vendorForm.website} onChange={(e) => setVendorFormField('website', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_phone">Phone</label>
                <input id="vendor_form_phone" type="text" value={vendorForm.phone} onChange={(e) => setVendorFormField('phone', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_mobile">Mobile</label>
                <input id="vendor_form_mobile" type="text" value={vendorForm.mobile} onChange={(e) => setVendorFormField('mobile', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_email">Email (the PO is emailed here)</label>
                <input id="vendor_form_email" type="text" value={vendorForm.email} onChange={(e) => setVendorFormField('email', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_altEmail">Alt Email (separate several with ;)</label>
                <input id="vendor_form_altEmail" type="text" value={vendorForm.altEmail} onChange={(e) => setVendorFormField('altEmail', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_address1">Address Line 1</label>
                <input id="vendor_form_address1" type="text" value={vendorForm.address1} onChange={(e) => setVendorFormField('address1', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_address2">Address Line 2</label>
                <input id="vendor_form_address2" type="text" value={vendorForm.address2} onChange={(e) => setVendorFormField('address2', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div>
                <label htmlFor="vendor_form_city">City</label>
                <input id="vendor_form_city" type="text" value={vendorForm.city} onChange={(e) => setVendorFormField('city', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_region">Province/State</label>
                <input id="vendor_form_region" type="text" value={vendorForm.region} onChange={(e) => setVendorFormField('region', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_postal">Postal/ZIP Code</label>
                <input id="vendor_form_postal" type="text" value={vendorForm.postal} onChange={(e) => setVendorFormField('postal', e.target.value)} />
              </div>
              <div>
                <label htmlFor="vendor_form_country">Country</label>
                <input id="vendor_form_country" type="text" value={vendorForm.country} onChange={(e) => setVendorFormField('country', e.target.value)} />
              </div>
            </div>
            <label htmlFor="vendor_form_notes">Notes</label>
            <input id="vendor_form_notes" type="text" value={vendorForm.notes} onChange={(e) => setVendorFormField('notes', e.target.value)} />
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

        <div className="edit-toolbar" style={{ marginBottom: 8 }}>
          <input
            type="search"
            placeholder="Search vendors: name, legal name, ID, contact, email, city"
            aria-label="Search vendors"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            style={{ minWidth: 320 }}
          />
          {vendorSearch.trim() && (
            <span className="sub" style={{ margin: 0 }}>
              {shownVendors.length} of {vendors.length}
            </span>
          )}
        </div>
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '15%' }} />
              <col />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>ID</th>
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
              {shownVendors.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={9}>
                    {vendors.length === 0 ? 'No vendors yet.' : 'No vendors match the search.'}
                  </td>
                </tr>
              ) : (
                shownVendors.map((v) => (
                  <tr key={v.id} style={v.active === false ? { opacity: 0.6 } : undefined}>
                    <td>{v.vendor_code || '—'}</td>
                    <td>
                      {v.name}
                      {v.legal_name && v.legal_name !== v.name && <div className="sub">Legal: {v.legal_name}</div>}
                      {v.active === false && (
                        <div className="sub" style={{ color: 'var(--danger)' }}>
                          Deactivated{v.deactivation_reason ? ` — ${v.deactivation_reason}` : ''}
                        </div>
                      )}
                      {v.approval_status === 'pending' && <div className="sub">Pending approval</div>}
                      {v.approval_status === 'rejected' && (
                        <div className="sub" style={{ color: 'var(--danger)' }}>
                          Rejected{v.rejection_reason ? ` — ${v.rejection_reason}` : ''}
                        </div>
                      )}
                    </td>
                    <td>{v.contact_name || '—'}</td>
                    <td>
                      {v.phone || (v.mobile ? '' : '—')}
                      {v.mobile && <div className="sub">Mobile: {v.mobile}</div>}
                    </td>
                    <td>
                      {v.email || '—'}
                      {v.alt_email && <div className="sub">{v.alt_email}</div>}
                      {v.website && <div className="sub">{v.website}</div>}
                    </td>
                    <td className="center-cell">
                      <input
                        type="checkbox"
                        checked={Boolean(v.logon_enabled)}
                        onChange={(e) => handleUpdateVendorLogon(v, { logon_enabled: e.target.checked })}
                      />
                      {v.logon_enabled && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ display: 'block', margin: '4px auto 0', padding: '1px 8px', fontSize: 12 }}
                          onClick={() => handleResetVendorPassword(v)}
                          title="Give this vendor a new temporary password"
                        >
                          Reset password
                        </button>
                      )}
                    </td>
                    <td>
                      {vendorAddressLines(v).length === 0
                        ? '—'
                        : vendorAddressLines(v).map((line, i) => <div key={i}>{line}</div>)}
                    </td>
                    <td>{v.notes || '—'}</td>
                    <td className="col-last">
                      <button className="btn-secondary" onClick={() => openEditVendorForm(v)}>
                        Edit
                      </button>{' '}
                      <button
                        className="btn-secondary"
                        onClick={() => handleSetVendorActive(v, v.active === false)}
                        title={
                          v.active === false
                            ? 'Let this vendor be used again'
                            : 'Keep the vendor and its history, but stop it being used for new requests'
                        }
                      >
                        {v.active === false ? 'Reactivate' : 'Deactivate'}
                      </button>{' '}
                      {/* TEMPORARY (testing): vendors should only ever be deactivated; delete stays while testing. */}
                      <button className="del-btn" onClick={() => handleDeleteVendor(v)} title="Temporary — use Deactivate instead">
                        Delete
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
          {programs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0' }}>
              <span className="sub" style={{ margin: 0 }}>
                In budget type:
              </span>
              {programs.map((g) => (
                <label key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={newProjectPrograms.includes(g.id)}
                    onChange={(e) =>
                      setNewProjectPrograms((prev) => (e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
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
              {programs.length > 0 && <col style={{ width: '35%' }} />}
              <col style={{ width: '20%' }} />
              {projects.some((p) => 'po_no_site' in p) && <col style={{ width: '18%' }} />}
              {projects.some((p) => 'can_rebill' in p) && <col style={{ width: '18%' }} />}
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Name</th>
                {programs.length > 0 && <th>Budget Types</th>}
                <th>PO Code</th>
                {projects.some((p) => 'po_no_site' in p) && (
                  <th title="Tick for a ground-mount entity: the PO form won't ask which site a PO is for.">No site question on POs</th>
                )}
                {projects.some((p) => 'can_rebill' in p) && (
                  <th title="Tick for an entity that re-bills expenses to other entities (Firelight Operations LP): its POs under a re-billing category (O&M Overage) are re-billed to another entity, and then count against that entity's budget.">Can re-bill expenses</th>
                )}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={programs.length > 0 ? 3 : 2}>
                    No entities yet.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    {programs.length > 0 && (
                      <td className="sub">
                        {programs
                          .filter((g) => programSiteIds?.get(g.id)?.has(p.id))
                          .map((g) => g.name)
                          .join(', ') || '—'}
                      </td>
                    )}
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
                    {'po_no_site' in p && (
                      <td className="center-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(p.po_no_site)}
                          onChange={(e) => handleUpdateProjectNoSite(p.id, e.target.checked)}
                        />
                      </td>
                    )}
                    {'can_rebill' in p && (
                      <td className="center-cell">
                        <input
                          type="checkbox"
                          checked={Boolean(p.can_rebill)}
                          onChange={(e) => handleUpdateProjectCanRebill(p.id, e.target.checked)}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Sites{draftSubProjects.length ? `(${draftSubProjects.length})` : ''}</h2>
          <p className="sub" style={{ margin: 0 }}>
            Individual sites within an Entity (e.g. Firelight Solar LP's rooftops) — only used
            when creating Purchase Requests. Spares inventory stays tracked at the Entity level.
            {siteExtraEntitiesReady && ' A site belongs to one Entity but can also be made available to others (e.g. Firelight Operations LP).'}
          </p>
          {!siteExtraEntitiesReady && (
            <p className="sub" style={{ margin: '6px 0 0' }}>
              To make a site available to more than one Entity, run add_site_extra_entities.sql in Supabase, then reload this page.
            </p>
          )}
        </div>

        {siteExtraEntitiesReady && draftSubProjects.length > 0 && (
          <div className="edit-toolbar" style={{ marginBottom: 12, alignItems: 'center' }}>
            <label htmlFor="site_share_entity" style={{ margin: 0 }}>Make every site available to</label>
            <select id="site_share_entity" value={shareEntityId} onChange={(e) => setShareEntityId(e.target.value)}>
              <option value="">Select an entity…</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary"
              disabled={!shareEntityId || savingSubProjects}
              onClick={() => {
                makeAllSitesAvailableTo(Number(shareEntityId))
                setShareEntityId('')
              }}
            >
              Apply
            </button>
            <span className="sub">Ticks it on every row below (except that entity's own sites). Press Save to keep it.</span>
          </div>
        )}

        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col />
              {siteExtraEntitiesReady && <col style={{ width: '28%' }} />}
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Entity</th>
                <th>Name</th>
                {siteExtraEntitiesReady && <th>Also available to</th>}
                <th className="col-last"></th>
              </tr>
            </thead>
            <tbody>
              {draftSubProjects.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={siteExtraEntitiesReady ? 4 : 3}>
                    No sites yet.
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
                    {siteExtraEntitiesReady && (
                      <td>
                        <AlsoEntitiesPicker
                          site={sp}
                          entities={projects}
                          onChange={(ids) => updateDraftSubProjectField(i, 'also_project_ids', ids)}
                        />
                      </td>
                    )}
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
            + Add Site
          </button>
        </div>
      </div>
    </>
  )
}

export default UsersTab
