import { useState } from 'react'
import {
  canMatchInvoices,
  canApproveInvoice,
  canManagePayment,
  canConfirmReceipt,
  usersWithRole,
  findUserName,
  isAdmin,
} from '../utils'

// Receipts & Invoices table for a PO's detail view. The requisitioner
// uploads receipts and Invoice Matching uploads/pairs invoices,
// independently/in parallel; each row below is either a matched pair, an
// invoice still waiting on a receipt, or a receipt still waiting on an
// invoice. Approving a matched pair (Invoice Approval) and marking it paid
// (Payment) are their own separate roles, distinct from matching.
function InvoicesPanel({
  request,
  loggedInUser,
  users,
  busy,
  handleAddInvoice,
  handleApproveInvoice,
  handlePayInvoice,
  handleDeleteInvoice,
  handleAddReceipt,
  handleDeleteReceipt,
  handleMatchInvoiceReceipt,
}) {
  const canManage = canMatchInvoices(loggedInUser, request)
  const canPay = canManagePayment(loggedInUser, request)
  const canAddReceipt = canConfirmReceipt(loggedInUser, request)
  const canDelete = isAdmin(loggedInUser)
  const invoices = request.invoices || []
  const receipts = request.receipts || []

  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState('')
  const [invoiceAmountDraft, setInvoiceAmountDraft] = useState('')
  // Per-row draft invoice#/amount for the inline "add & match" mini-form
  // that appears in an unmatched receipt's empty Invoice cell, keyed by
  // receipt id (several unmatched receipts can each have their own draft).
  const [rowInvoiceDrafts, setRowInvoiceDrafts] = useState({})

  function setRowInvoiceDraft(receiptId, field, value) {
    setRowInvoiceDrafts((prev) => ({ ...prev, [receiptId]: { ...prev[receiptId], [field]: value } }))
  }

  const unmatchedReceiptIds = new Set(receipts.map((r) => r.id))
  for (const inv of invoices) {
    if (inv.matched_receipt_id) unmatchedReceiptIds.delete(inv.matched_receipt_id)
  }
  const unmatchedReceipts = receipts.filter((r) => unmatchedReceiptIds.has(r.id))
  const unmatchedInvoices = invoices.filter((inv) => !inv.matched_receipt_id)

  const rows = [
    ...invoices.map((inv) => ({
      invoice: inv,
      receipt: inv.matched_receipt_id ? receipts.find((r) => r.id === inv.matched_receipt_id) || null : null,
    })),
    ...unmatchedReceipts.map((r) => ({ invoice: null, receipt: r })),
  ]

  function submitNewInvoice(file) {
    if (!file) return
    handleAddInvoice(request, { invoiceNumber: invoiceNumberDraft, amount: invoiceAmountDraft, file })
    setInvoiceNumberDraft('')
    setInvoiceAmountDraft('')
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-header">
        <h2>Receipts &amp; Invoices</h2>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No receipts or invoices yet.</div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet" style={{ marginBottom: 12 }}>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Receipt</th>
                <th>Invoice</th>
                <th className="center-cell">Approved</th>
                <th>Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.invoice?.id ?? 'x'}-${row.receipt?.id ?? 'x'}`
                const matched = Boolean(row.invoice && row.receipt)
                return (
                  <tr key={key}>
                    <td>
                      {row.receipt ? (
                        <>
                          {findUserName(users, row.receipt.uploaded_by)} —{' '}
                          {new Date(row.receipt.uploaded_at).toLocaleDateString()}
                          {row.receipt.file_url && (
                            <>
                              {' '}
                              <a href={row.receipt.file_url} target="_blank" rel="noreferrer">
                                View
                              </a>
                            </>
                          )}
                        </>
                      ) : canManage || canAddReceipt ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {canManage && unmatchedReceipts.length > 0 && (
                            <select
                              defaultValue=""
                              disabled={busy}
                              onChange={(e) => {
                                if (e.target.value) handleMatchInvoiceReceipt(row.invoice, Number(e.target.value))
                              }}
                            >
                              <option value="">Match to existing receipt…</option>
                              {unmatchedReceipts.map((r) => (
                                <option value={r.id} key={r.id}>
                                  {findUserName(users, r.uploaded_by)} —{' '}
                                  {new Date(r.uploaded_at).toLocaleDateString()}
                                </option>
                              ))}
                            </select>
                          )}
                          {canAddReceipt && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                              Add &amp; match:
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={busy}
                                onChange={(e) => {
                                  const file = e.target.files[0]
                                  if (file) handleAddReceipt(request, file, row.invoice.id)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <span className="sub" style={{ margin: 0 }}>
                          Unmatched
                        </span>
                      )}
                    </td>
                    <td>
                      {row.invoice ? (
                        <>
                          {row.invoice.invoice_number || '—'} — ${Number(row.invoice.amount).toFixed(2)}
                          <br />
                          <span className="sub" style={{ margin: 0 }}>
                            {findUserName(users, row.invoice.uploaded_by)} —{' '}
                            {new Date(row.invoice.uploaded_at).toLocaleDateString()}
                          </span>
                          {row.invoice.file_url && (
                            <>
                              {' '}
                              <a href={row.invoice.file_url} target="_blank" rel="noreferrer">
                                View
                              </a>
                            </>
                          )}
                        </>
                      ) : canManage ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {unmatchedInvoices.length > 0 && (
                            <select
                              defaultValue=""
                              disabled={busy}
                              onChange={(e) => {
                                if (!e.target.value) return
                                const invoice = unmatchedInvoices.find((inv) => String(inv.id) === e.target.value)
                                if (invoice) handleMatchInvoiceReceipt(invoice, row.receipt.id)
                              }}
                            >
                              <option value="">Match to existing invoice…</option>
                              {unmatchedInvoices.map((inv) => (
                                <option value={inv.id} key={inv.id}>
                                  {inv.invoice_number || '—'} — ${Number(inv.amount).toFixed(2)}
                                </option>
                              ))}
                            </select>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span className="sub" style={{ margin: 0 }}>
                              Add &amp; match:
                            </span>
                            <input
                              type="text"
                              placeholder="Invoice #"
                              value={rowInvoiceDrafts[row.receipt.id]?.number || ''}
                              onChange={(e) => setRowInvoiceDraft(row.receipt.id, 'number', e.target.value)}
                              style={{ maxWidth: 100 }}
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount"
                              value={rowInvoiceDrafts[row.receipt.id]?.amount || ''}
                              onChange={(e) => setRowInvoiceDraft(row.receipt.id, 'amount', e.target.value)}
                              style={{ maxWidth: 90 }}
                            />
                            <input
                              type="file"
                              accept="application/pdf"
                              disabled={busy}
                              onChange={(e) => {
                                const file = e.target.files[0]
                                if (!file) return
                                const draft = rowInvoiceDrafts[row.receipt.id] || {}
                                handleAddInvoice(request, {
                                  invoiceNumber: draft.number,
                                  amount: draft.amount,
                                  file,
                                  matchToReceiptId: row.receipt.id,
                                })
                                e.target.value = ''
                                setRowInvoiceDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[row.receipt.id]
                                  return next
                                })
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="sub" style={{ margin: 0 }}>
                          Unmatched
                        </span>
                      )}
                    </td>
                    <td className="center-cell">
                      {matched ? (
                        canApproveInvoice(loggedInUser, row.invoice, request) ? (
                          <input
                            type="checkbox"
                            checked={Boolean(row.invoice.approved)}
                            disabled={busy}
                            onChange={(e) => handleApproveInvoice(row.invoice, e.target.checked)}
                          />
                        ) : row.invoice.approved ? (
                          'Yes'
                        ) : (
                          <span className="sub" style={{ margin: 0 }}>
                            Waiting on {usersWithRole(users, 'invoice_approval').join(', ') || 'Invoice Approval'}
                          </span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.invoice && row.invoice.approved ? (
                        canPay ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(row.invoice.paid)}
                              disabled={busy}
                              onChange={(e) => handlePayInvoice(row.invoice, e.target.checked)}
                            />
                            {row.invoice.paid ? `Paid — ${new Date(row.invoice.paid_at).toLocaleDateString()}` : 'Not paid'}
                          </label>
                        ) : row.invoice.paid ? (
                          'Yes'
                        ) : (
                          'No'
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {canDelete && (
                        <>
                          {row.receipt && (
                            <button
                              className="btn-secondary"
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => handleDeleteReceipt(row.receipt)}
                              disabled={busy}
                            >
                              Del. Receipt
                            </button>
                          )}
                          {row.invoice && (
                            <button
                              className="btn-secondary"
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => handleDeleteInvoice(row.invoice)}
                              disabled={busy}
                            >
                              Del. Invoice
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="edit-toolbar" style={{ flexWrap: 'wrap' }}>
        {canAddReceipt && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            Add Receipt:
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files[0]
                if (file) handleAddReceipt(request, file)
                e.target.value = ''
              }}
            />
          </label>
        )}
        {canManage && (
          <>
            <input
              type="text"
              placeholder="Invoice #"
              value={invoiceNumberDraft}
              onChange={(e) => setInvoiceNumberDraft(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={invoiceAmountDraft}
              onChange={(e) => setInvoiceAmountDraft(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              Add Invoice (PDF):
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files[0]
                  submitNewInvoice(file)
                  e.target.value = ''
                }}
              />
            </label>
          </>
        )}
      </div>
    </div>
  )
}

export default InvoicesPanel
