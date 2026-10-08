import { useRef, useState } from 'react'
import InvoiceReview from './InvoiceReview'
import {
  canMatchInvoices,
  canApproveInvoice,
  canManagePayment,
  canConfirmReceipt,
  usersWithRole,
  findUserName,
  isAdmin,
  formatMoney,
  isPrepaid,
  canSetPrepaid,
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
  handleSetPrepaid,
  poPdfRequest,
  poStamp,
}) {
  const canManage = canMatchInvoices(loggedInUser, request)
  const canPay = canManagePayment(loggedInUser, request)
  const canAddReceipt = canConfirmReceipt(loggedInUser, request)
  const canDelete = isAdmin(loggedInUser)
  const invoices = request.invoices || []
  const receipts = request.receipts || []
  // Pre-paid: no receipt to match, so invoices go straight to approval.
  const prepaid = isPrepaid(request)
  const canTogglePrepaid = canSetPrepaid(loggedInUser, request)

  // The invoice being added: choosing a PDF reads it (number, amount, how it
  // compares with the PO) and shows that for review before anything is saved.
  // { file, receiptId, number, amount, scan: { busy, note }, review, error }
  const [pending, setPending] = useState(null)
  const scanToken = useRef(0)

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

  async function startInvoice(file, receiptId = null) {
    if (!file) return
    const token = ++scanToken.current
    const fresh = (patch) => setPending((p) => (p && token === scanToken.current ? { ...p, ...patch } : p))
    setPending({ file, receiptId, number: '', amount: '', scan: { busy: true }, review: null, error: '' })
    if (file.type !== 'application/pdf') {
      fresh({ scan: { note: 'Please choose a PDF file.' } })
      return
    }
    try {
      const { prepareInvoiceReview } = await import('../scrape/invoiceReview.js')
      const review = await prepareInvoiceReview(file, poPdfRequest || request, poStamp)
      if (!review.hasText) {
        fresh({ scan: { note: 'No readable text in this PDF (a scan?) — enter the invoice number and amount by hand.' } })
        return
      }
      const { invoiceNumber, amount } = review.extracted
      const found = [
        invoiceNumber && `Invoice # ${invoiceNumber.value}`,
        amount && `${formatMoney(amount.value)}${amount.currency ? ` ${amount.currency}` : ''}`,
      ].filter(Boolean)
      const missing = [!invoiceNumber && 'invoice number', !amount && 'total'].filter(Boolean)
      const note =
        (found.length ? `Read from the PDF: ${found.join(', ')}. Check before saving.` : '') +
        (missing.length ? `${found.length ? ' ' : ''}Couldn't find the ${missing.join(' or ')} — enter it by hand.` : '')
      setPending((p) =>
        p && token === scanToken.current
          ? {
              ...p,
              number: p.number || (invoiceNumber ? invoiceNumber.value : ''),
              amount: p.amount === '' && amount ? String(amount.value) : p.amount,
              scan: { note },
              review,
            }
          : p
      )
      // The side-by-side pictures take a moment longer; they arrive on their
      // own and the invoice can be added without waiting for them.
      review.loadViews().then((views) => {
        setPending((p) => (p && token === scanToken.current ? { ...p, review: { ...p.review, views } } : p))
      })
    } catch (error) {
      console.error(error)
      fresh({ scan: { note: "Couldn't read this PDF — enter the invoice number and amount by hand." } })
    }
  }

  async function submitPending() {
    const n = Number(pending.amount)
    if (!pending.amount || Number.isNaN(n) || n <= 0) {
      setPending((p) => ({ ...p, error: 'Enter a valid invoice amount.' }))
      return
    }
    const ok = await handleAddInvoice(request, {
      invoiceNumber: pending.number,
      amount: pending.amount,
      file: pending.file,
      matchToReceiptId: pending.receiptId,
    })
    if (ok) {
      scanToken.current++
      setPending(null)
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-header">
        <h2>Receipts &amp; Invoices</h2>
        {canTogglePrepaid ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }} title="The vendor is paid up front: invoices skip receipt matching and go straight to approval">
            <input
              type="checkbox"
              checked={Boolean(request.prepaid)}
              disabled={busy}
              onChange={(e) => handleSetPrepaid(request, e.target.checked)}
            />
            Pre-paid
          </label>
        ) : (
          prepaid && <span className="po-badge po-category-badge-prepaid">Pre-paid</span>
        )}
      </div>
      {prepaid && (
        <p className="sub" style={{ margin: '0 0 8px' }}>
          Pre-paid: invoices don't need a receipt matched — they go straight to Invoice Approval.
        </p>
      )}

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
                // Ready for approval: matched to a receipt, or pre-paid (no receipt to match).
                const approvable = Boolean(row.invoice) && (matched || prepaid)
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
                          {prepaid && row.invoice && (
                            <span className="sub" style={{ margin: 0 }}>
                              Pre-paid — no receipt needed
                            </span>
                          )}
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
                          {prepaid && row.invoice ? 'Pre-paid — no receipt needed' : 'Unmatched'}
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
                              type="file"
                              accept="application/pdf"
                              disabled={busy}
                              onChange={(e) => {
                                startInvoice(e.target.files[0], row.receipt.id)
                                e.target.value = ''
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
                      {approvable ? (
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

      {pending && (
        <InvoiceReview
          pending={pending}
          request={request}
          busy={busy}
          onChange={(field, value) => setPending((p) => ({ ...p, [field]: value, error: '' }))}
          onSubmit={submitPending}
          onCancel={() => {
            scanToken.current++
            setPending(null)
          }}
        />
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              Add Invoice (PDF):
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(e) => {
                  startInvoice(e.target.files[0])
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
