// Flattened { request, invoice } rows for the "My Invoices to Pay" view: invoices the
// supervisor has approved for payment and that accounting hasn't confirmed paid yet.
// Accounting pays them outside the system (in a batch), then comes back and confirms
// each one here with the date it was paid and a reference. Like the approvals table its
// rows are invoices, not purchase requests. The list can be narrowed to one payment batch.
import { useState } from 'react'
import Papa from 'papaparse'
import { downloadCsv } from '../stockUtils'
import { findUserName, paymentBatchLabel, totalsByCurrencyText } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'
import PaymentConfirm from './PaymentConfirm'

const approvedAt = ({ invoice }) => invoice.approved_at
const NO_BATCH = 'none'

const amountsOf = (pairs) => pairs.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency }))

function MyInvoicesToPayTable({ invoicesToPay, toggleExpandedPo, handlePayInvoice, poActionBusyId, users, paymentBatchSummaries }) {
  const [batchFilter, setBatchFilter] = useState('')
  const summaries = paymentBatchSummaries || []
  const byId = new Map(summaries.map((s) => [s.batch.id, s]))

  // Batches that still have something to pay, for the filter; plus "no batch" for invoices
  // approved before batches existed, when there are any.
  const openBatchIds = new Set(invoicesToPay.map(({ invoice }) => invoice.payment_batch_id).filter((id) => byId.has(id)))
  const openBatches = summaries.filter((s) => openBatchIds.has(s.batch.id))
  const hasUnbatched = invoicesToPay.some(({ invoice }) => !byId.has(invoice.payment_batch_id))
  const showBatches = summaries.length > 0

  // A chosen batch that has since been paid in full (or emptied) drops out of the dropdown: fall
  // back to showing everything rather than an empty list under a filter that can't be seen.
  const activeFilter =
    batchFilter === NO_BATCH ? (hasUnbatched ? NO_BATCH : '') : openBatchIds.has(Number(batchFilter)) ? batchFilter : ''
  const inFilter = invoicesToPay.filter(({ invoice }) => {
    if (!activeFilter) return true
    if (activeFilter === NO_BATCH) return !byId.has(invoice.payment_batch_id)
    return String(invoice.payment_batch_id) === activeFilter
  })
  const range = useDateRange(inFilter, approvedAt)
  const listed = range.listed
  const total = listed.reduce((sum, { invoice }) => sum + Number(invoice.amount || 0), 0)
  const chosenBatch = activeFilter && activeFilter !== NO_BATCH ? byId.get(Number(activeFilter)) : null

  const batchOf = (invoice) => byId.get(invoice.payment_batch_id)?.batch

  // The list as a spreadsheet, to work from while paying the batch.
  function exportList() {
    const rows = listed.map(({ request, invoice }) => ({
      ...(showBatches ? { 'Payment batch': batchOf(invoice) ? paymentBatchLabel(batchOf(invoice)) : '' } : {}),
      Vendor: request.vendors?.name || '',
      'PO #': request.po_number || `#${request.id}`,
      Entity: request.projects?.name || '',
      'Invoice #': invoice.invoice_number || '',
      Amount: Number(invoice.amount || 0).toFixed(2),
      Currency: request.currency || 'CAD',
      'Approved for payment': invoice.approved_at ? new Date(invoice.approved_at).toLocaleDateString() : '',
      'Invoice file': invoice.file_url || '',
    }))
    downloadCsv(`invoices-to-pay-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(rows))
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          My Invoices to Pay ({listed.length})
          {listed.length > 0 && <span className="sub"> — ${total.toFixed(2)} outstanding</span>}
        </h2>
        <div className="header-actions">
          {showBatches && (
            <select aria-label="Payment batch" value={activeFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All batches</option>
              {openBatches.map(({ batch, items }) => (
                <option key={batch.id} value={batch.id}>
                  {paymentBatchLabel(batch)} — {items.filter(({ invoice }) => invoice.paid).length} of {items.length} paid
                </option>
              ))}
              {hasUnbatched && <option value={NO_BATCH}>Approved before batches</option>}
            </select>
          )}
          <DateRangeFilter range={range} what="approved" />
          <button className="btn-secondary" onClick={exportList} disabled={listed.length === 0}>
            Download List (CSV)
          </button>
        </div>
      </div>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        These have been approved for payment. Pay them, then confirm each one here with the date paid and a reference.
        Once every invoice on a PO is paid, the requisitioner can close it.
      </p>
      {chosenBatch && (
        <p className="sub" style={{ margin: '0 0 8px' }}>
          <strong>{paymentBatchLabel(chosenBatch.batch)}</strong> — approved by {findUserName(users, chosenBatch.batch.approved_by)} on{' '}
          {new Date(chosenBatch.batch.approved_at).toLocaleDateString()}: {chosenBatch.items.length} invoice
          {chosenBatch.items.length === 1 ? '' : 's'}, {totalsByCurrencyText(amountsOf(chosenBatch.items))},{' '}
          {chosenBatch.items.filter(({ invoice }) => invoice.paid).length} paid so far.
        </p>
      )}

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesToPay.length === 0
            ? 'No invoices approved for payment are waiting.'
            : 'No invoices match the batch or date range.'}
        </div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '12%' }} />
              {showBatches && <col style={{ width: '13%' }} />}
              <col style={{ width: '12%' }} />
              <col />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Invoice #</th>
                <th className="center-cell">Amount</th>
                <th>PO #</th>
                <th>Entity</th>
                <th>Vendor</th>
                {showBatches && <th>Batch</th>}
                <DateSortHeader range={range} label="Approved" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map(({ request, invoice }) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number || '—'}</td>
                  <td className="center-cell">${Number(invoice.amount).toFixed(2)}</td>
                  <td>{request.po_number || `#${request.id}`}</td>
                  <td className="nowrap-cell">{request.projects?.name || '—'}</td>
                  <td>{request.vendors?.name || '—'}</td>
                  {showBatches && <td>{batchOf(invoice) ? paymentBatchLabel(batchOf(invoice)) : '—'}</td>}
                  <td>
                    {invoice.approved_at ? new Date(invoice.approved_at).toLocaleDateString() : '—'}
                    {invoice.approved_by && (
                      <div className="sub" style={{ margin: 0 }}>
                        {findUserName(users, invoice.approved_by)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                        View
                      </button>
                      <PaymentConfirm
                        busy={poActionBusyId === request.id}
                        onConfirm={(details) => handlePayInvoice(invoice, true, details)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MyInvoicesToPayTable
