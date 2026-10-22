import { totalsByCurrencyText, formatMoney, findUserName, isInvoiceHeld, canHoldInvoice, canReleaseInvoice, formatDate, formatDateTime } from '../utils'
import { DateRangeFilter, DateSortHeader, useDateRange } from './DateRange'
import { ColumnFilterBar, FilterTh, byAmount, useColumnFilters } from './ColumnFilter'

// "My Invoices to Review": invoices on POs the person raised that accounting has
// matched to a receipt (or that are on a pre-paid PO) and that are now waiting for
// the requisitioner to check them. Approving one sends it on to the supervisor's
// payment approval; sending it back returns it to accounting with a reason.
// Rows are { request, invoice } pairs.
const uploadedAt = ({ invoice }) => invoice.uploaded_at

// Excel-style column filters (see ColumnFilter.jsx).
const COLUMNS = [
  { key: 'invoice', label: 'Invoice #', values: ({ invoice }) => invoice.invoice_number },
  { key: 'amount', label: 'Amount', values: ({ invoice }) => formatMoney(invoice.amount), sort: byAmount },
  { key: 'po', label: 'PO #', values: ({ request }) => request.po_number || '#' + request.id },
  { key: 'entity', label: 'Site', values: ({ request }) => request.projects?.name },
  { key: 'vendor', label: 'Vendor', values: ({ request }) => request.vendors?.name },
]

function MyInvoicesToReviewTable({
  invoicesToReview,
  toggleExpandedPo,
  handleReviewInvoice,
  handleReturnInvoice,
  handleHoldInvoice,
  handleReleaseInvoice,
  poActionBusyId,
  loggedInUser,
  users,
}) {
  const range = useDateRange(invoicesToReview, uploadedAt)
  const filters = useColumnFilters(range.listed, COLUMNS)
  const listed = filters.filtered
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
        Open the PO to see the invoice and receipt side by side. Approving sends the invoice to the supervisor for payment approval. Hold pauses an
        invoice (for example while you check something with the vendor); it can't be approved until you release it.
      </p>

      <ColumnFilterBar filters={filters} shown={listed.length} />
      {listed.length === 0 ? (
        <div className="empty">
          {invoicesToReview.length === 0
            ? 'No invoices waiting on your review.'
            : filters.activeKeys.length > 0
            ? 'No invoices match the column filters.'
            : 'No invoices match the date range.'}
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
                <FilterTh filters={filters} col="invoice">Invoice #</FilterTh>
                <FilterTh filters={filters} col="amount" className="center-cell">Amount</FilterTh>
                <FilterTh filters={filters} col="po">PO #</FilterTh>
                <FilterTh filters={filters} col="entity">Site</FilterTh>
                <FilterTh filters={filters} col="vendor">Vendor</FilterTh>
                <DateSortHeader range={range} label="Uploaded" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map(({ request, invoice }) => {
                const busy = poActionBusyId === request.id
                return (
                  <tr key={invoice.id}>
                    <td>
                      {invoice.invoice_number || '—'}
                      {isInvoiceHeld(invoice) && (
                        <div>
                          <div style={{ color: 'var(--warn)', fontWeight: 600 }}>On hold</div>
                          <div className="sub" style={{ margin: 0 }}>
                            {invoice.hold_reason || '—'} — {findUserName(users, invoice.held_by)}, {formatDate(invoice.held_at)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="center-cell">{formatMoney(invoice.amount)}</td>
                    <td>{request.po_number || `#${request.id}`}</td>
                    <td className="nowrap-cell">{request.projects?.name || '—'}</td>
                    <td>{request.vendors?.name || '—'}</td>
                    <td>{formatDateTime(invoice.uploaded_at)}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => toggleExpandedPo(request.id)}>
                        View
                      </button>{' '}
                      {isInvoiceHeld(invoice) ? (
                        canReleaseInvoice(loggedInUser, invoice, request) && (
                          <>
                            <button className="btn-secondary" onClick={() => handleReleaseInvoice(invoice)} disabled={busy}>
                              Release
                            </button>{' '}
                          </>
                        )
                      ) : (
                        <>
                          <button className="btn-primary" onClick={() => handleReviewInvoice(invoice, true)} disabled={busy}>
                            Approve
                          </button>{' '}
                          {canHoldInvoice(loggedInUser, invoice, request) && (
                            <>
                              <button className="btn-secondary" onClick={() => handleHoldInvoice(invoice)} disabled={busy}>
                                Hold
                              </button>{' '}
                            </>
                          )}
                        </>
                      )}
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
