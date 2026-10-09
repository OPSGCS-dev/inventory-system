// Flattened { request, invoice } rows for the "My Invoices to Pay" view: invoices the
// supervisor has approved for payment and that accounting hasn't confirmed paid yet.
// Accounting pays them outside the system (in a batch), then comes back and confirms
// each one here with the date it was paid and a reference. Like the approvals table its
// rows are invoices, not purchase requests.
import Papa from 'papaparse'
import { downloadCsv } from '../stockUtils'
import { findUserName } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'
import PaymentConfirm from './PaymentConfirm'

const approvedAt = ({ invoice }) => invoice.approved_at

function MyInvoicesToPayTable({ invoicesToPay, toggleExpandedPo, handlePayInvoice, poActionBusyId, users }) {
  const range = useDateRange(invoicesToPay, approvedAt)
  const listed = range.listed
  const total = listed.reduce((sum, { invoice }) => sum + Number(invoice.amount || 0), 0)

  // The list as a spreadsheet, to work from while paying the batch.
  function exportList() {
    const rows = listed.map(({ request, invoice }) => ({
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

      {listed.length === 0 ? (
        <div className="empty">
          {invoicesToPay.length === 0 ? 'No invoices approved for payment are waiting.' : 'No invoices match the date range.'}
        </div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col />
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
