import { useState } from 'react'
import { formatMoney, totalsByCurrencyText } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

// "My Invoices for Payment Approval": the supervisor's list. Every invoice the
// requisitioner has reviewed and approved piles up here; a few times a month the
// supervisor ticks the ones to pay and approves them in one go, which releases them to
// accounting. A single invoice can instead be sent back to accounting with a reason.
// Rows are { request, invoice } pairs.
const reviewedAt = ({ invoice }) => invoice.reviewed_at || invoice.uploaded_at

function MyInvoicesForApprovalTable({
  invoicesPendingApproval,
  toggleExpandedPo,
  handleApproveInvoicesForPayment,
  handleReturnInvoice,
  poActionBusyId,
}) {
  const range = useDateRange(invoicesPendingApproval, reviewedAt)
  const listed = range.listed
  // Ticked invoice ids. Kept apart from the list so a changed date range or a refreshed
  // list can't leave an invoice ticked that's no longer on screen (see `chosen` below).
  const [ticked, setTicked] = useState(() => new Set())
  const batchBusy = poActionBusyId === 'invoice-batch'

  const chosen = listed.filter(({ invoice }) => ticked.has(invoice.id))
  const allTicked = listed.length > 0 && chosen.length === listed.length

  function toggle(id) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setTicked(allTicked ? new Set() : new Set(listed.map(({ invoice }) => invoice.id)))
  }

  async function approveChosen() {
    const total = totalsByCurrencyText(chosen.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency })))
    if (!window.confirm(`Approve ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} for payment (${total})?`)) return
    const ok = await handleApproveInvoicesForPayment(chosen)
    if (ok) setTicked(new Set())
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>My Invoices for Payment Approval ({listed.length})</h2>
        <div className="header-actions">
          <DateRangeFilter range={range} what="reviewed" />
        </div>
        {listed.length > 0 && (
          <div className="sub" style={{ margin: 0 }}>
            Total waiting:{' '}
            <strong>
              {totalsByCurrencyText(listed.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency })))}
            </strong>
          </div>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesPendingApproval.length === 0
            ? 'No invoices waiting on payment approval.'
            : 'No invoices match the date range.'}
        </div>
      ) : (
        <>
          <div className="edit-toolbar" style={{ flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={approveChosen} disabled={chosen.length === 0 || batchBusy}>
              {batchBusy ? 'Approving…' : chosen.length > 0 ? `Approve ${chosen.length} Selected for Payment` : 'Approve Selected for Payment'}
            </button>
            {chosen.length > 0 && (
              <span className="sub" style={{ margin: 0 }}>
                Selected total:{' '}
                <strong>
                  {totalsByCurrencyText(chosen.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency })))}
                </strong>
              </span>
            )}
          </div>
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col />
                <col style={{ width: '170px' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="center-cell">
                    <input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Invoice #</th>
                  <th className="center-cell">Amount</th>
                  <th>PO #</th>
                  <th>Entity</th>
                  <th>Vendor</th>
                  <DateSortHeader range={range} label="Reviewed" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listed.map(({ request, invoice }) => (
                  <tr key={invoice.id}>
                    <td className="center-cell">
                      <input
                        type="checkbox"
                        checked={ticked.has(invoice.id)}
                        onChange={() => toggle(invoice.id)}
                        aria-label={`Select invoice ${invoice.invoice_number || invoice.id}`}
                      />
                    </td>
                    <td>{invoice.invoice_number || '—'}</td>
                    <td className="center-cell">{formatMoney(invoice.amount)}</td>
                    <td>{request.po_number || `#${request.id}`}</td>
                    <td className="nowrap-cell">{request.projects?.name || '—'}</td>
                    <td>{request.vendors?.name || '—'}</td>
                    <td>{new Date(reviewedAt({ invoice })).toLocaleString()}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                        View
                      </button>{' '}
                      {handleReturnInvoice && invoice.reviewed !== undefined && (
                        <button
                          className="btn-secondary"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          onClick={() => handleReturnInvoice(invoice)}
                          disabled={batchBusy || poActionBusyId === request.id}
                        >
                          Send Back
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default MyInvoicesForApprovalTable
