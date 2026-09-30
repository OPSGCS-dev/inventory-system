import { useState } from 'react'
import { canManageInvoicing, canApproveInvoice, canConfirmReceipt, findUserName, isAdmin } from '../utils'

// Receipts & Invoices table for a PO's detail view. Accounting uploads
// invoices and the requisitioner uploads receipts independently/in
// parallel; each row below is either a matched pair, an invoice still
// waiting on a receipt, or a receipt still waiting on an invoice. Approving
// a matched pair is gated to the specific person who approved this PO's
// original requisition (canApproveInvoice), not just any accounting user.
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
  const canManage = canManageInvoicing(loggedInUser)
  const canAddReceipt = canConfirmReceipt(loggedInUser, request)
  const canDelete = isAdmin(loggedInUser)
  const invoices = request.invoices || []
  const receipts = request.receipts || []

  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState('')
  const [invoiceAmountDraft, setInvoiceAmountDraft] = useState('')

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
                      ) : canManage && unmatchedReceipts.length > 0 ? (
                        <select
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            if (e.target.value) handleMatchInvoiceReceipt(row.invoice, Number(e.target.value))
                          }}
                        >
                          <option value="">Match to receipt…</option>
                          {unmatchedReceipts.map((r) => (
                            <option value={r.id} key={r.id}>
                              {findUserName(users, r.uploaded_by)} — {new Date(r.uploaded_at).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
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
                      ) : canManage && unmatchedInvoices.length > 0 ? (
                        <select
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            if (!e.target.value) return
                            const invoice = unmatchedInvoices.find((inv) => String(inv.id) === e.target.value)
                            if (invoice) handleMatchInvoiceReceipt(invoice, row.receipt.id)
                          }}
                        >
                          <option value="">Match to invoice…</option>
                          {unmatchedInvoices.map((inv) => (
                            <option value={inv.id} key={inv.id}>
                              {inv.invoice_number || '—'} — ${Number(inv.amount).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="sub" style={{ margin: 0 }}>
                          Unmatched
                        </span>
                      )}
                    </td>
                    <td className="center-cell">
                      {matched ? (
                        canApproveInvoice(loggedInUser, request, row.invoice) ? (
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
                            Waiting on {findUserName(users, request.approved_by)}
                          </span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.invoice && row.invoice.approved ? (
                        canManage ? (
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
