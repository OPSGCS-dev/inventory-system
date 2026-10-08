// Flattened { request, invoice } rows for the "My Invoices to Pay" view: an
// invoice that has been approved but not yet paid. Like the approvals table
// its rows are invoices, not purchase requests.
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'

const approvedAt = ({ invoice }) => invoice.approved_at

function MyInvoicesToPayTable({ invoicesToPay, toggleExpandedPo, handlePayInvoice, poActionBusyId }) {
  const range = useDateRange(invoicesToPay, approvedAt)
  const listed = range.listed
  const total = listed.reduce((sum, { invoice }) => sum + Number(invoice.amount || 0), 0)

  function markPaid(request, invoice) {
    const label = invoice.invoice_number ? `invoice ${invoice.invoice_number}` : 'this invoice'
    const amount = `$${Number(invoice.amount).toFixed(2)}`
    if (!window.confirm(`Mark ${label} (${amount}) as paid?`)) return
    handlePayInvoice(invoice, true)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          My Invoices to Pay ({listed.length})
          {listed.length > 0 && <span className="sub"> — ${total.toFixed(2)} outstanding</span>}
        </h2>
        <div className="header-actions">
          <DateRangeFilter range={range} what="approved" />
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesToPay.length === 0 ? 'No approved invoices waiting to be paid.' : 'No invoices match the date range.'}
        </div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col />
              <col style={{ width: '170px' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Invoice #</th>
                <th className="center-cell">Amount</th>
                <th>PO #</th>
                <th>Entity</th>
                <th>Vendor</th>
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
                  <td>{invoice.approved_at ? new Date(invoice.approved_at).toLocaleString() : '—'}</td>
                  <td>
                    <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                      View
                    </button>{' '}
                    <button
                      className="btn-primary"
                      onClick={() => markPaid(request, invoice)}
                      disabled={poActionBusyId === request.id}
                    >
                      Mark Paid
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

export default MyInvoicesToPayTable
