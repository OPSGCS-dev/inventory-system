import { useState } from 'react'
import { ColumnFilterBar, FilterTh, byAmount, useColumnFilters } from './ColumnFilter'
import { findUserName, formatMoney, isInvoiceHeld, paymentBatchLabel, totalsByCurrencyText, formatDateTime, formatDate } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

// "My Invoices for Payment Approval": the supervisor's list. Every invoice the
// requisitioner has reviewed and approved piles up here; a few times a month the
// supervisor ticks the ones to pay and approves them in one go, which releases them to
// accounting as one named payment batch. A single invoice can instead be sent back to
// accounting with a reason, or put on hold (with a reason) while something is sorted out: a held
// invoice stays in the list but can't be ticked until it is released. Rows are { request, invoice } pairs.
const reviewedAt = ({ invoice }) => invoice.reviewed_at || invoice.uploaded_at

// Excel-style column filters (see ColumnFilter.jsx).
const COLUMNS = [
  { key: 'invoice', label: 'Invoice #', values: ({ invoice }) => invoice.invoice_number },
  { key: 'amount', label: 'Amount', values: ({ invoice }) => formatMoney(invoice.amount), sort: byAmount },
  { key: 'po', label: 'PO #', values: ({ request }) => request.po_number || '#' + request.id },
  { key: 'entity', label: 'Entity', values: ({ request }) => request.projects?.name },
  { key: 'vendor', label: 'Vendor', values: ({ request }) => request.vendors?.name },
]

const amountsOf = (pairs) => pairs.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency }))

function MyInvoicesForApprovalTable({
  invoicesPendingApproval,
  toggleExpandedPo,
  handleApproveInvoicesForPayment,
  handleReturnInvoice,
  handleHoldInvoice,
  handleReleaseInvoice,
  poActionBusyId,
  paymentBatchesReady,
  paymentBatchSummaries,
  users,
}) {
  const range = useDateRange(invoicesPendingApproval, reviewedAt)
  const filters = useColumnFilters(range.listed, COLUMNS)
  const listed = filters.filtered
  // Ticked invoice ids. Kept apart from the list so a changed date range or a refreshed
  // list can't leave an invoice ticked that's no longer on screen (see `chosen` below).
  const [ticked, setTicked] = useState(() => new Set())
  const [batchName, setBatchName] = useState('')
  const batchBusy = poActionBusyId === 'invoice-batch'

  // Held invoices can't be approved, so they can't be ticked either.
  const selectable = listed.filter(({ invoice }) => !isInvoiceHeld(invoice))
  const heldCount = listed.length - selectable.length
  const chosen = selectable.filter(({ invoice }) => ticked.has(invoice.id))
  const allTicked = selectable.length > 0 && chosen.length === selectable.length

  function toggle(id) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setTicked(allTicked ? new Set() : new Set(selectable.map(({ invoice }) => invoice.id)))
  }

  async function approveChosen() {
    const name = batchName.trim() || `Payment run ${formatDate(new Date())}`
    const what = `${chosen.length} invoice${chosen.length === 1 ? '' : 's'} (${totalsByCurrencyText(amountsOf(chosen))})`
    if (!window.confirm(`Approve ${what} for payment${paymentBatchesReady ? ` as "${name}"` : ''}?`)) return
    const ok = await handleApproveInvoicesForPayment(chosen, batchName)
    if (ok) {
      setTicked(new Set())
      setBatchName('')
    }
  }

  const recentBatches = (paymentBatchSummaries || []).slice(0, 5)

  return (
    <div className="card">
      <div className="card-header">
        <h2>My Invoices for Payment Approval ({listed.length})</h2>
        <div className="header-actions">
          <DateRangeFilter range={range} what="reviewed" />
        </div>
        {listed.length > 0 && (
          <div className="sub" style={{ margin: 0 }}>
            Total waiting: <strong>{totalsByCurrencyText(amountsOf(listed))}</strong>
            {heldCount > 0 && <> — {heldCount} on hold</>}
          </div>
        )}
      </div>

      <ColumnFilterBar filters={filters} shown={listed.length} />
      {listed.length === 0 ? (
        <div className="empty">
          {invoicesPendingApproval.length === 0
            ? 'No invoices waiting on payment approval.'
            : filters.activeKeys.length > 0
            ? 'No invoices match the column filters.'
            : 'No invoices match the date range.'}
        </div>
      ) : (
        <>
          <div className="edit-toolbar" style={{ flexWrap: 'wrap' }}>
            {paymentBatchesReady && (
              <input
                type="text"
                aria-label="Batch name"
                placeholder={`Batch name (optional) — Payment run ${formatDate(new Date())}`}
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                style={{ minWidth: 280 }}
              />
            )}
            <button className="btn-primary" onClick={approveChosen} disabled={chosen.length === 0 || batchBusy}>
              {batchBusy ? 'Approving…' : chosen.length > 0 ? `Approve ${chosen.length} Selected for Payment` : 'Approve Selected for Payment'}
            </button>
            {chosen.length > 0 && (
              <span className="sub" style={{ margin: 0 }}>
                Selected total: <strong>{totalsByCurrencyText(amountsOf(chosen))}</strong>
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
                <col style={{ width: '240px' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="center-cell">
                    <input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={selectable.length === 0} aria-label="Select all" />
                  </th>
                  <FilterTh filters={filters} col="invoice">Invoice #</FilterTh>
                  <FilterTh filters={filters} col="amount" className="center-cell">Amount</FilterTh>
                  <FilterTh filters={filters} col="po">PO #</FilterTh>
                  <FilterTh filters={filters} col="entity">Entity</FilterTh>
                  <FilterTh filters={filters} col="vendor">Vendor</FilterTh>
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
                        checked={ticked.has(invoice.id) && !isInvoiceHeld(invoice)}
                        disabled={isInvoiceHeld(invoice)}
                        onChange={() => toggle(invoice.id)}
                        aria-label={`Select invoice ${invoice.invoice_number || invoice.id}`}
                      />
                    </td>
                    <td>
                      {invoice.invoice_number || '—'}
                      {isInvoiceHeld(invoice) && (
                        <div style={{ color: 'var(--warn)', fontWeight: 600 }}>On hold</div>
                      )}
                    </td>
                    <td className="center-cell">{formatMoney(invoice.amount)}</td>
                    <td>{request.po_number || `#${request.id}`}</td>
                    <td className="nowrap-cell">{request.projects?.name || '—'}</td>
                    <td>{request.vendors?.name || '—'}</td>
                    <td>
                      {formatDateTime(reviewedAt({ invoice }))}
                      {isInvoiceHeld(invoice) && (
                        <div className="sub" style={{ margin: 0 }}>
                          Held by {findUserName(users, invoice.held_by)}, {formatDate(invoice.held_at)}: {invoice.hold_reason || '—'}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                        View
                      </button>{' '}
                      {isInvoiceHeld(invoice)
                        ? handleReleaseInvoice && (
                            <>
                              <button
                                className="btn-secondary"
                                onClick={() => handleReleaseInvoice(invoice)}
                                disabled={batchBusy || poActionBusyId === request.id}
                              >
                                Release
                              </button>{' '}
                            </>
                          )
                        : handleHoldInvoice &&
                          'held_at' in invoice && (
                            <>
                              <button
                                className="btn-secondary"
                                onClick={() => handleHoldInvoice(invoice)}
                                disabled={batchBusy || poActionBusyId === request.id}
                              >
                                Hold
                              </button>{' '}
                            </>
                          )}
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

      {recentBatches.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 6px' }}>Recent payment batches</h3>
          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr className="header-row">
                  <th>Batch</th>
                  <th>Approved</th>
                  <th>By</th>
                  <th className="center-cell">Invoices</th>
                  <th>Total</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map(({ batch, items }) => {
                  const paid = items.filter(({ invoice }) => invoice.paid).length
                  return (
                    <tr key={batch.id}>
                      <td>{paymentBatchLabel(batch)}</td>
                      <td>{formatDate(batch.approved_at)}</td>
                      <td>{findUserName(users, batch.approved_by)}</td>
                      <td className="center-cell">{items.length}</td>
                      <td>{totalsByCurrencyText(amountsOf(items))}</td>
                      <td>{paid === items.length ? 'All paid' : `${paid} of ${items.length}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default MyInvoicesForApprovalTable
