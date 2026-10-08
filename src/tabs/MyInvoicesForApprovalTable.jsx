import { formatMoney, totalsByCurrencyText } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

// Flattened { request, invoice } rows for the "My Invoices for Approval"
// view -- its rows are invoices, not purchase requests, so it doesn't share
// the PO summary table's columns.
const uploadedAt = ({ invoice }) => invoice.uploaded_at

function MyInvoicesForApprovalTable({ invoicesPendingApproval, toggleExpandedPo }) {
  const range = useDateRange(invoicesPendingApproval, uploadedAt)
  const listed = range.listed
  return (
    <div className="card">
      <div className="card-header">
        <h2>My Invoices for Approval ({listed.length})</h2>
        <div className="header-actions">
          <DateRangeFilter range={range} what="uploaded" />
        </div>
        {listed.length > 0 && (
          <div className="sub" style={{ margin: 0 }}>
            Total pending:{' '}
            <strong>
              {totalsByCurrencyText(
                listed.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency }))
              )}
            </strong>
          </div>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesPendingApproval.length === 0 ? 'No invoices waiting on approval.' : 'No invoices match the date range.'}
        </div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col />
              <col style={{ width: '110px' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Invoice #</th>
                <th className="center-cell">Amount</th>
                <th>PO #</th>
                <th>Entity</th>
                <th>Vendor</th>
                <DateSortHeader range={range} label="Uploaded" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map(({ request, invoice }) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number || '—'}</td>
                  <td className="center-cell">{formatMoney(invoice.amount)}</td>
                  <td>{request.po_number || `#${request.id}`}</td>
                  <td className="nowrap-cell">{request.projects?.name || '—'}</td>
                  <td>{request.vendors?.name || '—'}</td>
                  <td>{new Date(invoice.uploaded_at).toLocaleString()}</td>
                  <td>
                    <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                      View
                    </button>
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

export default MyInvoicesForApprovalTable
