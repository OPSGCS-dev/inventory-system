import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import {
  poStatusLabel,
  workStatusLabel,
  paymentStatusLabel,
  findUserName,
  userHasRole,
  canCreatePurchaseRequests,
  canManageInvoicing,
  canApproveRequests,
  canClosePo,
  computeWorkStatus,
  computePaymentStatus,
  WORK_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PO_PROGRESS_STAGES,
  PO_PROGRESS_STAGE_LABELS,
  computePoProgressStage,
  lineTotal,
  filterPartsForSearch,
  isApprovedOrLater,
  canPreviewPo,
  buildPoMailto,
  computePoTotals,
  COMPANY_ADDRESS_BLOCK,
  PO_STATUS_ORDER,
  nextStepInfo,
  truncate,
  canConfirmReceipt,
  poLineType,
  TICKETING_URL,
  isAdmin,
} from '../utils'
import InvoicesPanel from './InvoicesPanel'
import MyInvoicesForApprovalTable from './MyInvoicesForApprovalTable'

function formatTicketNumber(n) {
  return `TK-${String(n).padStart(5, '0')}`
}

const PO_DESCRIPTION_MAX_LEN = 50

// The summary list's progress stepper only covers the "in flight" statuses —
// a draft hasn't entered the workflow yet, so every dot starts unfilled.
// 'in_progress'/'paid' aren't real status values -- they're display-only
// stages computed from the Work Status / Payment Status dropdowns while a
// PO sits at 'issued' (see computePoProgressStage).
const PO_PROGRESS_ALL_LABELS = PO_PROGRESS_STAGES.map((s) => PO_PROGRESS_STAGE_LABELS[s])

function PoProgressStepper({ request }) {
  const stage = computePoProgressStage(request)
  const currentIndex = PO_PROGRESS_STAGES.indexOf(stage)
  const labels = PO_PROGRESS_ALL_LABELS
  const filled = PO_PROGRESS_STAGES.map((_, i) => i <= currentIndex)
  return (
    <div className="po-progress">
      {labels.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className={`po-progress-line${filled[i] ? ' filled' : ''}`} />}
          <span className={`po-progress-dot${filled[i] ? ' filled' : ''}`} title={label} />
        </Fragment>
      ))}
    </div>
  )
}

function PurchaseOrdersTab({
  loggedInUser,
  users,
  vendors,
  poStatus,
  poStatusFilter,
  setPoStatusFilter,
  poProjectFilter,
  setPoProjectFilter,
  poView,
  setPoView,
  projects,
  poLoading,
  visiblePurchaseRequests,
  invoicesPendingApproval,
  expandedPoId,
  toggleExpandedPo,
  poFormOpen,
  openPoDraftForm,
  closePoDraftForm,
  poDraftId,
  poDraftProjectId,
  setPoDraftProjectId,
  poDraftSubProjectId,
  setPoDraftSubProjectId,
  subProjects,
  poDraftVendorId,
  setPoDraftVendorId,
  poDraftNotes,
  setPoDraftNotes,
  poDraftDescription,
  setPoDraftDescription,
  poDraftFieldErrors,
  poDraftBudgetCategoryId,
  setPoDraftBudgetCategoryId,
  poDraftBudgetSubcategoryId,
  setPoDraftBudgetSubcategoryId,
  budgetCategories,
  budgetSubcategories,
  poDraftChargeableExpense,
  setPoDraftChargeableExpense,
  poDraftVendorQuoteNumber,
  setPoDraftVendorQuoteNumber,
  poDraftTicketSystemTicketId,
  poDraftTicketSystemTicketNumber,
  poDraftMarkupRate,
  setPoDraftMarkupRate,
  poDraftTaxRate,
  setPoDraftTaxRate,
  poDraftShippingHandling,
  setPoDraftShippingHandling,
  poDraftCredit,
  setPoDraftCredit,
  poDraftCurrency,
  setPoDraftCurrency,
  poDraftLines,
  handleAddPurchaseRequestLine,
  handleRemovePurchaseRequestLine,
  updatePoDraftLineField,
  parts,
  savingPoRequest,
  handleCreatePurchaseRequest,
  handleSubmitPurchaseRequest,
  handleApprovePurchaseRequest,
  issuingRequestId,
  startIssuePurchaseOrder,
  cancelIssuePurchaseOrder,
  pendingPoNumber,
  computingPoNumber,
  handleIssuePurchaseOrder,
  handleSetWorkStatus,
  handleSetPaymentStatus,
  handleAddInvoice,
  handleApproveInvoice,
  handlePayInvoice,
  handleDeleteInvoice,
  handleAddReceipt,
  handleDeleteReceipt,
  handleMatchInvoiceReceipt,
  handleClosePo,
  poActionBusyId,
  handleDeletePurchaseRequest,
}) {
  const canCreate = canCreatePurchaseRequests(loggedInUser)
  const canDelete = isAdmin(loggedInUser)
  const canSeeApprovalsView = canApproveRequests(loggedInUser)
  const canSeeInvoicesView = canManageInvoicing(loggedInUser)
  const availableSubcategories = budgetSubcategories.filter(
    (sc) => sc.category_id === poDraftBudgetCategoryId
  )
  const availableSubProjects = subProjects.filter((sp) => sp.project_id === poDraftProjectId)
  const viewingRequest = expandedPoId ? visiblePurchaseRequests.find((r) => r.id === expandedPoId) : null

  // Toggled by the "View PO" button on the detail screen — shows the same
  // printable layout used by Print PO, just inline on screen instead of
  // off-screen-until-printed.
  const [showPoPreview, setShowPoPreview] = useState(false)

  // The Status heading + flow legend live above the table (so they can run
  // wider than the narrow Status column itself), but still need to sit
  // horizontally centered directly over that column — so its pixel center is
  // measured from the real header cell and used to offset the heading block,
  // recomputed on resize since the column widths are percentage-based.
  const sheetWrapRef = useRef(null)
  const statusHeaderRef = useRef(null)
  const [statusCenter, setStatusCenter] = useState(null)

  useLayoutEffect(() => {
    function recompute() {
      if (!sheetWrapRef.current || !statusHeaderRef.current) return
      const wrapRect = sheetWrapRef.current.getBoundingClientRect()
      const thRect = statusHeaderRef.current.getBoundingClientRect()
      setStatusCenter(thRect.left - wrapRect.left + sheetWrapRef.current.scrollLeft + thRect.width / 2)
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [poLoading, visiblePurchaseRequests.length])

  if (viewingRequest) {
    const r = viewingRequest
    const busy = poActionBusyId === r.id
    const issuingThis = issuingRequestId === r.id
    return (
      <>
        <div className="card">
          <div className="edit-toolbar">
            <button className="btn-secondary" onClick={() => toggleExpandedPo(r.id)}>
              ← Back to Purchase Orders
            </button>
          </div>
          {poStatus && <div className={'status ' + (poStatus.ok ? 'ok' : 'err')}>{poStatus.msg}</div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              Request #{r.id} — {r.projects?.name || '—'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`po-badge po-badge-${computePoProgressStage(r)}`}>
                {PO_PROGRESS_STAGE_LABELS[computePoProgressStage(r)] || poStatusLabel(r.status)}
              </span>
              {canDelete && (
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => handleDeletePurchaseRequest(r)}
                  disabled={busy}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          <div className="po-detail-meta">
            <div className="po-detail-meta-item">
              <span className="po-detail-label">Vendor</span>
              <span className="po-detail-value">{r.vendors?.name || '—'}</span>
            </div>
            <div className="po-detail-meta-item">
              <span className="po-detail-label">PO #</span>
              <span className="po-detail-value">{r.po_number || '—'}</span>
            </div>
            {r.sub_projects?.name && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Project</span>
                <span className="po-detail-value">{r.sub_projects.name}</span>
              </div>
            )}
            {r.description && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Description</span>
                <span className="po-detail-value">{r.description}</span>
              </div>
            )}
            {r.budget_categories?.name && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Budget Category</span>
                <span className="po-detail-value">
                  {r.budget_categories.name}
                  {r.budget_subcategories?.name ? ` — ${r.budget_subcategories.name}` : ''}
                </span>
              </div>
            )}
            {r.ticket_system_ticket_id && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Ticket</span>
                <span className="po-detail-value">
                  <a
                    href={`${TICKETING_URL}/tickets/${r.ticket_system_ticket_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatTicketNumber(r.ticket_system_ticket_number)} ↗
                  </a>
                </span>
              </div>
            )}
          </div>

          <table className="po-detail-timeline">
            <tbody>
              <tr>
                <th>Requested</th>
                <td>
                  {r.requested_by
                    ? `${findUserName(users, r.requested_by)} — ${new Date(
                        r.submitted_at
                      ).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Approved</th>
                <td>
                  {r.approved_by
                    ? `${findUserName(users, r.approved_by)} — ${new Date(
                        r.approved_at
                      ).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Issued</th>
                <td>
                  {r.issued_by
                    ? `${findUserName(users, r.issued_by)} — ${new Date(r.issued_at).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>{poLineType(r) === 'service' ? 'Completed' : 'Received'}</th>
                <td>
                  {r.received_by
                    ? `${findUserName(users, r.received_by)} — ${new Date(
                        r.received_at
                      ).toLocaleString()}${r.receipt_file_name ? ` (${r.receipt_file_name})` : ''}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Work Status</th>
                <td>
                  {r.status === 'issued' && canConfirmReceipt(loggedInUser, r) ? (
                    <select
                      value={computeWorkStatus(r)}
                      disabled={busy}
                      onChange={(e) => handleSetWorkStatus(r, e.target.value)}
                    >
                      {Object.entries(WORK_STATUS_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    workStatusLabel(computeWorkStatus(r))
                  )}
                </td>
              </tr>
              <tr>
                <th>Payment Status</th>
                <td>
                  {r.status === 'issued' && canManageInvoicing(loggedInUser) ? (
                    <select
                      value={computePaymentStatus(r)}
                      disabled={busy}
                      onChange={(e) => handleSetPaymentStatus(r, e.target.value)}
                    >
                      {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    paymentStatusLabel(computePaymentStatus(r))
                  )}
                </td>
              </tr>
              {r.status === 'closed' && (
                <tr>
                  <th>Closed</th>
                  <td>
                    {r.closed_by
                      ? `${findUserName(users, r.closed_by)} — ${new Date(r.closed_at).toLocaleString()}`
                      : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <table className="sheet" style={{ marginBottom: 12, marginTop: 12 }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Type</th>
                <th>Part / Description</th>
                <th className="center-cell">Qty</th>
                <th className="center-cell">Unit Cost</th>
                <th className="center-cell">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(r.purchase_request_lines || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.line_type === 'part' ? 'Part' : 'Service'}</td>
                  <td>
                    {l.line_type === 'part'
                      ? `${l.parts?.gcs_id ?? l.part_gcs_id} — ${l.parts?.gcs_part_id || ''} — ${
                          l.parts?.description || ''
                        }${l.description ? ` (${l.description})` : ''}`
                      : l.description || '—'}
                  </td>
                  <td className="center-cell">{l.quantity}</td>
                  <td className="center-cell">{l.unit_cost ?? '—'}</td>
                  <td className="center-cell">{lineTotal(l).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {r.notes && (
            <p className="sub" style={{ margin: '0 0 12px' }}>
              Notes: {r.notes}
            </p>
          )}

          {canPreviewPo(r.status) && (
            <div className={'po-print-area' + (showPoPreview ? ' po-print-area-preview' : '')}>
              <div className="po-print-header">
                <div className="po-print-header-left">
                  <p className="po-print-project-name">{r.projects?.name || '—'}</p>
                  <div className="po-print-address">
                    {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
                <div className="po-print-header-right">
                  <h1 className="po-print-title">Purchase Order</h1>
                  <table className="po-print-meta">
                    <tbody>
                      <tr>
                        <th>PO Date</th>
                        <td>
                          {r.issued_at
                            ? new Date(r.issued_at).toLocaleDateString()
                            : new Date().toLocaleDateString()}
                        </td>
                      </tr>
                      <tr>
                        <th>PO #</th>
                        <td>{r.po_number || `#${r.id}`}</td>
                      </tr>
                      <tr>
                        <th>Chargeable Expense</th>
                        <td>{r.chargeable_expense ? 'Yes' : 'No'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="po-print-parties">
                <div>
                  <p className="po-print-label">Vendor:</p>
                  <p className="po-print-strong">{r.vendors?.name || '—'}</p>
                  {r.vendors?.address && (
                    <div className="po-print-address">
                      {r.vendors.address.split('\n').map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="po-print-label">Bill To:</p>
                  <p className="po-print-strong">{r.projects?.name || '—'}</p>
                  <div className="po-print-address">
                    {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
              </div>

              <table className="sheet po-print-lines">
                <thead>
                  <tr className="header-row">
                    <th>Item No.</th>
                    <th>GCS ID</th>
                    <th className="center-cell">Qty</th>
                    <th>Description</th>
                    <th className="center-cell">Unit Price</th>
                    <th className="center-cell">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.purchase_request_lines || []).map((l, idx) => (
                    <tr key={l.id}>
                      <td className="center-cell">{idx + 1}</td>
                      <td className="center-cell">
                        {l.line_type === 'part' ? l.parts?.gcs_id ?? l.part_gcs_id : ''}
                      </td>
                      <td className="center-cell">{l.quantity}</td>
                      <td>
                        {l.line_type === 'part'
                          ? `${l.parts?.description || ''}${
                              l.description ? ` (${l.description})` : ''
                            }`
                          : l.description || '—'}
                      </td>
                      <td className="center-cell">
                        {l.unit_cost !== null && l.unit_cost !== undefined
                          ? `$${Number(l.unit_cost).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="center-cell">${lineTotal(l).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(() => {
                const totals = computePoTotals(r)
                return (
                  <div className="po-print-footer">
                    <div className="po-print-footer-left">
                      <p>
                        <strong>Site:</strong> {r.sub_projects?.name || r.projects?.name || '—'}
                      </p>
                      <p>
                        <strong>Notes:</strong> {r.notes || '—'}
                      </p>
                    </div>
                    <div className="po-print-totals">
                      <table>
                        <tbody>
                          <tr>
                            <th>Subtotal</th>
                            <td>${totals.subtotal.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Credit</th>
                            <td>-${totals.credit.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Shipping/Handling</th>
                            <td>${totals.shipping.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Vendor Mark-Up</th>
                            <td>
                              {totals.markupRate.toFixed(1)}% ${totals.markupAmount.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <th>Sales Taxes</th>
                            <td>
                              {totals.taxRate.toFixed(1)}% ${totals.taxAmount.toFixed(2)}
                            </td>
                          </tr>
                          <tr className="po-print-grand-total">
                            <th>Grand Total</th>
                            <td>${totals.grandTotal.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Currency</th>
                            <td>{r.currency || 'CAD'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* PLACEHOLDER: user will provide exact wording + real invoice email later */}
              <ol className="po-print-instructions">
                <li>Please send the invoice to: [invoice email placeholder]</li>
                <li>
                  Enter this note in accordance with the prices, terms, delivery method, and
                  specifications listed above.
                </li>
                <li>Notify GCS immediately if PO number or work order is not specified.</li>
                <li>Reference the PO number on the invoice.</li>
                <li>Send all correspondence to: [same fixed company address block]</li>
              </ol>

              <div className="po-print-bottom">
                <div className="po-print-address po-print-address-small">
                  {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
                <div className="po-print-reference">
                  Additional Reference: Vendor Quote # {r.vendor_quote_number || '—'}
                </div>
              </div>

              <div className="po-print-signature">
                Authorized by: ____________________&nbsp;&nbsp;&nbsp;&nbsp; Date: ____________________
              </div>
            </div>
          )}

          <div className="edit-toolbar">
            {r.status === 'draft' && (
              <>
                {canCreate && (
                  <button className="btn-secondary" onClick={() => openPoDraftForm(r)}>
                    Edit Draft
                  </button>
                )}
                <button
                  className="btn-primary"
                  onClick={() => handleSubmitPurchaseRequest(r)}
                  disabled={busy || !canCreate}
                >
                  {busy ? 'Submitting…' : 'Submit'}
                </button>
                {!canCreate && (
                  <span className="sub" style={{ margin: 0 }}>
                    You don't have permission to submit requests.
                  </span>
                )}
              </>
            )}

            {r.status === 'submitted' &&
              (userHasRole(loggedInUser, 'approve') ? (
                <button
                  className="btn-primary"
                  onClick={() => handleApprovePurchaseRequest(r)}
                  disabled={busy}
                >
                  {busy ? 'Approving…' : 'Approve'}
                </button>
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  Waiting on an approver.
                </span>
              ))}

            {r.status === 'approved' &&
              (userHasRole(loggedInUser, 'approve') ? (
                issuingThis ? (
                  <>
                    <span className="sub" style={{ margin: 0 }}>
                      {computingPoNumber
                        ? 'Generating PO number…'
                        : `Assign PO number ${pendingPoNumber}?`}
                    </span>
                    <button
                      className="btn-primary"
                      onClick={() => handleIssuePurchaseOrder(r)}
                      disabled={busy || computingPoNumber || !pendingPoNumber}
                    >
                      {busy ? 'Issuing…' : 'Confirm PO'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={cancelIssuePurchaseOrder}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => startIssuePurchaseOrder(r)}>
                    Issue PO
                  </button>
                )
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  Waiting on an approver to issue the PO.
                </span>
              ))}

            {r.status === 'issued' && canClosePo(loggedInUser, r) && (
              <button className="btn-primary" onClick={() => handleClosePo(r)} disabled={busy}>
                {busy ? 'Closing…' : 'Close PO'}
              </button>
            )}

            {r.status === 'closed' && (
              <span className="sub" style={{ margin: 0 }}>
                Closed.
              </span>
            )}

            {canPreviewPo(r.status) && (
              <button className="btn-secondary" onClick={() => setShowPoPreview((v) => !v)}>
                {showPoPreview ? 'Hide PO' : 'View PO'}
              </button>
            )}
            {r.receipt_file_url && (
              <a className="btn-secondary" href={r.receipt_file_url} target="_blank" rel="noreferrer">
                {poLineType(r) === 'service' ? 'View Service Report' : 'View Photo'}
              </a>
            )}
            {isApprovedOrLater(r.status) && userHasRole(loggedInUser, 'approve') && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  Print PO
                </button>
                {buildPoMailto(r) ? (
                  <a className="btn-secondary" href={buildPoMailto(r)}>
                    Email Vendor
                  </a>
                ) : (
                  <span className="sub" style={{ margin: 0 }}>
                    No vendor email on file.
                  </span>
                )}
              </>
            )}
          </div>

          {(r.status === 'issued' || r.status === 'closed') && (
            <InvoicesPanel
              request={r}
              loggedInUser={loggedInUser}
              users={users}
              busy={busy}
              handleAddInvoice={handleAddInvoice}
              handleApproveInvoice={handleApproveInvoice}
              handlePayInvoice={handlePayInvoice}
              handleDeleteInvoice={handleDeleteInvoice}
              handleAddReceipt={handleAddReceipt}
              handleDeleteReceipt={handleDeleteReceipt}
              handleMatchInvoiceReceipt={handleMatchInvoiceReceipt}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          {canCreate && !poFormOpen && (
            <button className="btn-primary" onClick={() => openPoDraftForm(null)}>
              + New Request
            </button>
          )}
        </div>

        {poStatus && <div className={'status ' + (poStatus.ok ? 'ok' : 'err')}>{poStatus.msg}</div>}
      </div>

      {poFormOpen && (
        <div className="card">
          <div className="card-header">
            <h2>{poDraftId ? 'Edit Draft Request' : 'New Purchase Request'}</h2>
            {poDraftTicketSystemTicketNumber && (
              <a
                href={`${TICKETING_URL}/tickets/${poDraftTicketSystemTicketId}`}
                target="_blank"
                rel="noreferrer"
                className="sub"
              >
                🔗 Linked to {formatTicketNumber(poDraftTicketSystemTicketNumber)}
              </a>
            )}
          </div>

          <div className="field-row">
            <div>
              <label htmlFor="po_draft_project">Entity</label>
              <select
                id="po_draft_project"
                className={poDraftFieldErrors?.project ? 'field-invalid' : ''}
                value={poDraftProjectId ?? ''}
                onChange={(e) => {
                  setPoDraftProjectId(e.target.value ? Number(e.target.value) : null)
                  setPoDraftSubProjectId(null)
                }}
              >
                <option value="">Select an entity…</option>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="po_draft_vendor">Vendor</label>
              <select
                id="po_draft_vendor"
                className={poDraftFieldErrors?.vendor ? 'field-invalid' : ''}
                value={poDraftVendorId ?? ''}
                onChange={(e) => setPoDraftVendorId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a vendor…</option>
                {vendors.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {availableSubProjects.length > 0 && (
            <div className="field-row" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="po_draft_sub_project">Project</label>
                <select
                  id="po_draft_sub_project"
                  className={poDraftFieldErrors?.subProject ? 'field-invalid' : ''}
                  value={poDraftSubProjectId ?? ''}
                  onChange={(e) => setPoDraftSubProjectId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select a project…</option>
                  {availableSubProjects.map((sp) => (
                    <option value={sp.id} key={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label htmlFor="po_draft_description" style={{ marginTop: 12 }}>
            Description
          </label>
          <input
            id="po_draft_description"
            type="text"
            placeholder="Short summary shown on the Purchase Requests list, e.g. Inverter fans for Site 4"
            value={poDraftDescription}
            onChange={(e) => setPoDraftDescription(e.target.value)}
          />

          <label htmlFor="po_draft_notes" style={{ marginTop: 12 }}>
            Notes
          </label>
          <input
            id="po_draft_notes"
            type="text"
            value={poDraftNotes}
            onChange={(e) => setPoDraftNotes(e.target.value)}
          />

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_budget_category">Budget Category</label>
              <select
                id="po_draft_budget_category"
                value={poDraftBudgetCategoryId ?? ''}
                onChange={(e) => {
                  setPoDraftBudgetCategoryId(e.target.value ? Number(e.target.value) : null)
                  setPoDraftBudgetSubcategoryId(null)
                }}
              >
                <option value="">Select a budget category…</option>
                {budgetCategories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {availableSubcategories.length > 0 && (
              <div>
                <label htmlFor="po_draft_budget_subcategory">Sub-Category</label>
                <select
                  id="po_draft_budget_subcategory"
                  value={poDraftBudgetSubcategoryId ?? ''}
                  onChange={(e) =>
                    setPoDraftBudgetSubcategoryId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Select a sub-category…</option>
                  {availableSubcategories.map((sc) => (
                    <option value={sc.id} key={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_vendor_quote">Vendor Quote #</label>
              <input
                id="po_draft_vendor_quote"
                type="text"
                value={poDraftVendorQuoteNumber}
                onChange={(e) => setPoDraftVendorQuoteNumber(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="po_draft_chargeable">Chargeable Expense</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 }}>
                <input
                  id="po_draft_chargeable"
                  type="checkbox"
                  checked={poDraftChargeableExpense}
                  onChange={(e) => setPoDraftChargeableExpense(e.target.checked)}
                />
                <span>{poDraftChargeableExpense ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_markup_rate">Markup %</label>
              <input
                id="po_draft_markup_rate"
                type="number"
                min="0"
                step="0.1"
                value={poDraftMarkupRate}
                onChange={(e) => setPoDraftMarkupRate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="po_draft_tax_rate">Sales Tax %</label>
              <input
                id="po_draft_tax_rate"
                type="number"
                min="0"
                step="0.1"
                value={poDraftTaxRate}
                onChange={(e) => setPoDraftTaxRate(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_shipping">Shipping/Handling</label>
              <input
                id="po_draft_shipping"
                type="number"
                min="0"
                step="0.01"
                value={poDraftShippingHandling}
                onChange={(e) => setPoDraftShippingHandling(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="po_draft_credit">Credit</label>
              <input
                id="po_draft_credit"
                type="number"
                min="0"
                step="0.01"
                value={poDraftCredit}
                onChange={(e) => setPoDraftCredit(e.target.value)}
              />
            </div>
          </div>

          <label htmlFor="po_draft_currency" style={{ marginTop: 12 }}>
            Currency
          </label>
          <select
            id="po_draft_currency"
            value={poDraftCurrency}
            onChange={(e) => setPoDraftCurrency(e.target.value)}
          >
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>

          <div className="card-header" style={{ marginTop: 16 }}>
            <h2>Line Items</h2>
          </div>

          <div className={'sheet-wrap' + (poDraftFieldErrors?.lines ? ' field-invalid' : '')}>
            <table className="sheet">
              <colgroup>
                <col style={{ width: '10%' }} />
                <col />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col className="col-last" />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th>Type</th>
                  <th>Part / Description</th>
                  <th className="center-cell">Qty</th>
                  <th className="center-cell">Unit Cost</th>
                  <th className="center-cell">Line Total</th>
                  <th className="col-last"></th>
                </tr>
              </thead>
              <tbody>
                {poDraftLines.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={6}>
                      No line items yet — click "+ Add Line".
                    </td>
                  </tr>
                ) : (
                  poDraftLines.map((line, i) => {
                    const part = line.part_gcs_id ? parts.find((p) => p.gcs_id === line.part_gcs_id) : null
                    return (
                      <tr key={line._tempId}>
                        <td>
                          {i === 0 ? (
                            <select
                              value={line.line_type}
                              onChange={(e) => updatePoDraftLineField(i, 'line_type', e.target.value)}
                            >
                              <option value="part">Part</option>
                              <option value="service">Service</option>
                            </select>
                          ) : (
                            <span className="sub" style={{ margin: 0 }}>
                              {line.line_type === 'part' ? 'Part' : 'Service'}
                            </span>
                          )}
                        </td>
                        <td>
                          {line.line_type === 'part' ? (
                            <>
                              <input
                                type="text"
                                className="part-search-input"
                                placeholder="Search GCS P/N, Part ID, or description…"
                                value={line.partSearch}
                                onChange={(e) => updatePoDraftLineField(i, 'partSearch', e.target.value)}
                              />
                              <select
                                className="part-picker-select"
                                value={line.part_gcs_id ?? ''}
                                onChange={(e) =>
                                  updatePoDraftLineField(
                                    i,
                                    'part_gcs_id',
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                style={{ marginTop: 4 }}
                              >
                                <option value="">
                                  {part
                                    ? `${part.gcs_id} — ${part.gcs_part_id} — ${part.description || ''}`
                                    : 'Select a part…'}
                                </option>
                                {filterPartsForSearch(parts, line.partSearch).map((p) => (
                                  <option value={p.gcs_id} key={p.gcs_id}>
                                    {p.gcs_id} — {p.gcs_part_id} — {p.description || ''}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Note (optional)"
                                value={line.description}
                                onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                                style={{ marginTop: 4 }}
                              />
                            </>
                          ) : (
                            <input
                              type="text"
                              placeholder="Service description"
                              value={line.description}
                              onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                            />
                          )}
                        </td>
                        <td className="center-cell">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => updatePoDraftLineField(i, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="center-cell">
                          <input
                            type="number"
                            min="0"
                            value={line.unit_cost}
                            onChange={(e) => updatePoDraftLineField(i, 'unit_cost', e.target.value)}
                          />
                        </td>
                        <td className="center-cell">{lineTotal(line).toFixed(2)}</td>
                        <td className="col-last">
                          <button className="del-btn" onClick={() => handleRemovePurchaseRequestLine(i)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="edit-toolbar" style={{ marginTop: 12 }}>
            <button className="btn-secondary" onClick={handleAddPurchaseRequestLine}>
              + Add Line
            </button>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreatePurchaseRequest} disabled={savingPoRequest}>
              {savingPoRequest ? 'Saving…' : 'Save Draft'}
            </button>
            <button className="btn-secondary" onClick={closePoDraftForm} disabled={savingPoRequest}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="edit-toolbar">
          <button className={poView === 'all' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPoView('all')}>
            All POs
          </button>
          {canSeeApprovalsView && (
            <button
              className={poView === 'my-approvals' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-approvals')}
            >
              My POs for Approval
            </button>
          )}
          {canSeeInvoicesView && (
            <button
              className={poView === 'my-invoices' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-invoices')}
            >
              My Invoices for Approval
            </button>
          )}
        </div>
      </div>

      {poView === 'my-invoices' ? (
        <MyInvoicesForApprovalTable
          invoicesPendingApproval={invoicesPendingApproval}
          toggleExpandedPo={toggleExpandedPo}
        />
      ) : (
      <div className="card">
        <div className="card-header">
          <h2>
            {poView === 'my-approvals' ? 'My POs for Approval' : 'Purchase Requests'}{' '}
            {poLoading ? '' : `(${visiblePurchaseRequests.length})`}
          </h2>
          <div className="header-actions">
            <select value={poStatusFilter} onChange={(e) => setPoStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {PO_STATUS_ORDER.map((s) => (
                <option value={s} key={s}>
                  {poStatusLabel(s)}
                </option>
              ))}
            </select>
            <select value={poProjectFilter} onChange={(e) => setPoProjectFilter(e.target.value)}>
              <option value="">All Entities</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {poLoading ? (
          <div className="empty">Loading...</div>
        ) : visiblePurchaseRequests.length === 0 ? (
          <div className="empty">No purchase requests yet.</div>
        ) : (
          <div className="sheet-wrap" ref={sheetWrapRef}>
            <div className="po-progress-heading-block">
              <div
                className="po-progress-heading-inner"
                style={{ marginLeft: statusCenter ?? '50%', transform: 'translateX(-50%)' }}
              >
                <div className="po-progress-heading">Status</div>
                <div className="po-progress-flow-legend">
                  {PO_PROGRESS_ALL_LABELS.map((label, i) => (
                    <Fragment key={label}>
                      {i > 0 && <span className="po-progress-flow-arrow">→</span>}
                      <span>{label}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            <table className="sheet po-summary-table">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '260px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '140px' }} />
                <col className="col-last" />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">ID</th>
                  <th>Description</th>
                  <th>Entity</th>
                  <th>Vendor</th>
                  <th ref={statusHeaderRef} className="center-cell">
                    Status
                  </th>
                  <th className="center-cell">Work</th>
                  <th className="center-cell">Payment</th>
                  <th>Requestor</th>
                  <th>Responsible for Next Action</th>
                  <th>PO #</th>
                  <th>Action</th>
                  <th className="col-last"></th>
                </tr>
              </thead>
              <tbody>
                {visiblePurchaseRequests.map((r) => {
                  const next = nextStepInfo(r, users)
                  const busy = poActionBusyId === r.id
                  const workStatus = computeWorkStatus(r)
                  const paymentStatus = computePaymentStatus(r)
                  return (
                    <tr key={r.id}>
                      <td className="row-head">{r.id}</td>
                      <td title={r.description || undefined}>
                        {r.description ? truncate(r.description, PO_DESCRIPTION_MAX_LEN) : '—'}
                      </td>
                      <td className="nowrap-cell">{r.projects?.name || '—'}</td>
                      <td>{r.vendors?.name || '—'}</td>
                      <td className="center-cell">
                        <PoProgressStepper request={r} />
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <span className={`po-badge po-work-badge-${workStatus}`}>
                            {workStatusLabel(workStatus)}
                          </span>
                        )}
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <span className={`po-badge po-payment-badge-${paymentStatus}`}>
                            {paymentStatusLabel(paymentStatus)}
                          </span>
                        )}
                      </td>
                      <td>{findUserName(users, r.requested_by)}</td>
                      <td className="nowrap-cell">{next.who || '—'}</td>
                      <td>{r.po_number || '—'}</td>
                      <td>
                        {r.status === 'draft' && canCreate && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => handleSubmitPurchaseRequest(r)}
                            disabled={busy}
                          >
                            {busy ? 'Submitting…' : 'Submit'}
                          </button>
                        )}
                        {r.status === 'submitted' && userHasRole(loggedInUser, 'approve') && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => handleApprovePurchaseRequest(r)}
                            disabled={busy}
                          >
                            {busy ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                        {r.status === 'approved' && userHasRole(loggedInUser, 'approve') && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => {
                              startIssuePurchaseOrder(r)
                              toggleExpandedPo(r.id)
                            }}
                          >
                            Convert to PO
                          </button>
                        )}
                        {r.status === 'issued' && canManageInvoicing(loggedInUser) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => toggleExpandedPo(r.id)}
                          >
                            Upload Invoice
                          </button>
                        )}
                        {r.status === 'issued' && canConfirmReceipt(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => toggleExpandedPo(r.id)}
                          >
                            Upload Receipt
                          </button>
                        )}
                        {r.status === 'issued' && canClosePo(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => handleClosePo(r)}
                            disabled={busy}
                          >
                            {busy ? 'Closing…' : 'Close PO'}
                          </button>
                        )}
                        {r.status === 'closed' && (
                          <span className="sub" style={{ margin: 0 }}>
                            Closed
                          </span>
                        )}
                      </td>
                      <td className="col-last">
                        <button className="btn-secondary" onClick={() => toggleExpandedPo(r.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </>
  )
}

export default PurchaseOrdersTab
