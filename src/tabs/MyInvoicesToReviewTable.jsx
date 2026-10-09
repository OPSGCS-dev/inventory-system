import { totalsByCurrencyText, formatMoney } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

// "My Invoices to Review": invoices on POs the person raised that accounting has
// matched to a receipt (or that are on a pre-paid PO) and that are now waiting for
// the requisitioner to check them. Approving one sends it on to the supervisor's
// payment approval; sending it back returns it to accounting with a reason.
// Rows are { request, invoice } pairs.
const uploadedAt = ({ invoice }) => invoice.uploaded_at

function MyInvoicesToReviewTable({ invoicesToReview, toggleExpandedPo, handleReviewInvoice, handleReturnInvoice, poActionBusyId }) {
  const range = useDateRange(invoicesToReview, uploadedAt)
  const listed = range.listed
  return (
    <div className="card">
      <div className="card-header">
        <h2>My Invoices to Review ({listed.length})</h2>
        <div className="header-actions">
          <DateRangeFilter range={range} what="uploaded" />
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
      <p className="sub" style={{ margin: '0 0 8px' }}>
        Open the PO to see the invoice and receipt side by side. Approving sends the invoice to the supervisor for payment approval.
      </p>

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesToReview.length === 0 ? 'No invoices waiting on your review.' : 'No invoices match the date range.'}
        </div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col />
              <col style={{ width: '250px' }} />
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
              {listed.map(({ request, invoice }) => {
                const busy = poActionBusyId === request.id
                return (
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
                      </button>{' '}
                      <button className="btn-primary" onClick={() => handleReviewInvoice(invoice, true)} disabled={busy}>
                        Approve
                      </button>{' '}
                      <button
                        className="btn-secondary"
                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        onClick={() => handleReturnInvoice(invoice)}
                        disabled={busy}
                      >
                        Send Back
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
  )
}

export default MyInvoicesToReviewTable
