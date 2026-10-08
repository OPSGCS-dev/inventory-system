import { formatMoney, totalsByCurrencyText } from '../utils'

// Flattened { request, invoice } rows for the "My Invoices for Approval"
// view -- its rows are invoices, not purchase requests, so it doesn't share
// the PO summary table's columns.
function MyInvoicesForApprovalTable({ invoicesPendingApproval, toggleExpandedPo }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>My Invoices for Approval ({invoicesPendingApproval.length})</h2>
        {invoicesPendingApproval.length > 0 && (
          <div className="sub" style={{ margin: 0 }}>
            Total pending:{' '}
            <strong>
              {totalsByCurrencyText(
                invoicesPendingApproval.map(({ request, invoice }) => ({ amount: invoice.amount, currency: request.currency }))
              )}
            </strong>
          </div>
        )}
      </div>

      {invoicesPendingApproval.length === 0 ? (
        <div className="empty">No invoices waiting on approval.</div>
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
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoicesPendingApproval.map(({ request, invoice }) => (
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
