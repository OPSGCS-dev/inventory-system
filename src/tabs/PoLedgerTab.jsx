import { Fragment, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import {
  poStatusLabel,
  findUserName,
  computePoTotals,
  computeInvoicedTotal,
  computePaymentStatus,
  paymentStatusLabel,
  lineTotal,
  lineLedgerTreatment,
  LEDGER_TREATMENT_LABELS,
} from '../utils'

// Which POs the ledger lists by default: the ones that were actually issued to
// a vendor (money committed), plus voided ones so a cancelled PO is still
// accounted for. Drafts, requests and rejected requests never reached a vendor.
const DEFAULT_STATUSES = ['issued', 'closed', 'voided']
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Issued, Closed & Voided' },
  { value: 'issued', label: 'PO Issued' },
  { value: 'closed', label: 'Closed' },
  { value: 'voided', label: 'Voided' },
  { value: 'all', label: 'All (incl. drafts)' },
]

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`

function lineLabel(line) {
  if (line.line_type === 'part') {
    const p = line.parts
    const id = p?.gcs_part_id || line.part_gcs_id || ''
    return [id, p?.description || line.description].filter(Boolean).join(' — ') || 'Part'
  }
  return line.description || 'Service'
}

// "Paid" / "Partially paid" / "Not invoiced" / "Unpaid", from the invoices
// actually on file -- not the manual Payment Status dropdown, which is shown
// separately so a mismatch between the two is visible to accounting.
function invoicePaidState(request) {
  const invoices = request.invoices || []
  if (invoices.length === 0) return 'Not invoiced'
  const paid = invoices.filter((i) => i.paid).length
  if (paid === invoices.length) return 'Paid'
  return paid > 0 ? 'Partially paid' : 'Unpaid'
}

// One flat row per PO line, with PO-level fields repeated for filtering and CSV.
// The PO-level money columns (totals, invoiced) are only filled on a PO's first
// line so summing a column never counts a PO twice.
function buildRows(requests) {
  const rows = []
  for (const r of requests) {
    const lines = [...(r.purchase_request_lines || [])].sort((a, b) => a.id - b.id)
    const totals = computePoTotals(r)
    const invoices = r.invoices || []
    const workDoneAt = r.received_at || r.service_completed_at || null
    lines.forEach((line, i) => {
      rows.push({
        key: `${r.id}-${line.id}`,
        request: r,
        first: i === 0,
        treatment: lineLedgerTreatment(line),
        line,
        lineText: lineLabel(line),
        lineTotal: lineTotal(line),
        poTotals: i === 0 ? totals : null,
        invoicedTotal: i === 0 ? computeInvoicedTotal(r) : null,
        invoiceNumbers: invoices.map((inv) => inv.invoice_number).filter(Boolean).join(', '),
        paidState: invoicePaidState(r),
        issuedAt: r.issued_at,
        workDoneAt,
      })
    })
  }
  return rows
}

function PoLedgerTab({ purchaseRequests, projects, vendors, users }) {
  const [statusFilter, setStatusFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [treatmentFilter, setTreatmentFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [activityOpenId, setActivityOpenId] = useState(null)
  const [activity, setActivity] = useState({})

  const rows = useMemo(() => {
    const requests = purchaseRequests.filter((r) => {
      if (statusFilter === 'all') {
        // everything
      } else if (statusFilter) {
        if (r.status !== statusFilter) return false
      } else if (!DEFAULT_STATUSES.includes(r.status)) {
        return false
      }
      if (entityFilter && String(r.project_id) !== entityFilter) return false
      if (vendorFilter && String(r.vendor_id) !== vendorFilter) return false
      // Date range is on the issue date (the day money was committed); a PO
      // with no issue date (a draft) only matches when no range is set.
      if (fromDate || toDate) {
        if (!r.issued_at) return false
        const day = r.issued_at.slice(0, 10)
        if (fromDate && day < fromDate) return false
        if (toDate && day > toDate) return false
      }
      return true
    })
    // POs keep the app's list order (newest first); lines stay together under their PO.
    const all = buildRows(requests)
    const q = search.trim().toLowerCase()
    return all.filter((row) => {
      if (treatmentFilter && row.treatment !== treatmentFilter) return false
      if (!q) return true
      const r = row.request
      return [r.po_number, r.vendors?.name, r.projects?.name, row.lineText, row.invoiceNumbers]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    })
  }, [purchaseRequests, statusFilter, entityFilter, vendorFilter, treatmentFilter, fromDate, toDate, search])

  // Totals by treatment, line subtotals only (markup/tax/shipping live at PO level),
  // and never counting voided POs -- a voided PO committed no money.
  const summary = useMemo(() => {
    const sums = { asset: 0, expense_used: 0, expense_consumable: 0, expense_service: 0 }
    for (const row of rows) {
      if (row.request.status === 'voided') continue
      sums[row.treatment] += row.lineTotal
    }
    return sums
  }, [rows])

  async function toggleActivity(requestId) {
    if (activityOpenId === requestId) {
      setActivityOpenId(null)
      return
    }
    setActivityOpenId(requestId)
    if (activity[requestId]) return
    const { data, error } = await supabase
      .from('purchase_request_activity')
      .select('id, note, created_at, user_id')
      .eq('purchase_request_id', requestId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error(error)
      setActivity((prev) => ({ ...prev, [requestId]: [] }))
      return
    }
    setActivity((prev) => ({ ...prev, [requestId]: data ?? [] }))
  }

  function handleExportCsv() {
    const csvRows = rows.map((row) => {
      const r = row.request
      return {
        'PO #': r.po_number || `#${r.id}`,
        Status: poStatusLabel(r.status),
        Entity: r.projects?.name || '',
        Project: r.sub_projects?.name || '',
        Vendor: r.vendors?.name || '',
        Issued: fmtDate(row.issuedAt),
        'Received / Completed': fmtDate(row.workDoneAt),
        Line: row.lineText,
        'Line Type': row.line.line_type === 'service' ? 'Service' : 'Part',
        Quantity: Number(row.line.quantity) || 0,
        'Unit Cost': Number(row.line.unit_cost) || 0,
        'Line Total': row.lineTotal.toFixed(2),
        'Accounting Treatment': LEDGER_TREATMENT_LABELS[row.treatment],
        Currency: r.currency || 'CAD',
        // PO-level columns: first line of each PO only, so a column sum is correct.
        'PO Subtotal': row.poTotals ? row.poTotals.subtotal.toFixed(2) : '',
        Credit: row.poTotals ? row.poTotals.credit.toFixed(2) : '',
        'Shipping/Handling': row.poTotals ? row.poTotals.shipping.toFixed(2) : '',
        'Vendor Mark-Up': row.poTotals ? row.poTotals.markupAmount.toFixed(2) : '',
        'Sales Tax': row.poTotals ? row.poTotals.taxAmount.toFixed(2) : '',
        'PO Grand Total': row.poTotals ? row.poTotals.grandTotal.toFixed(2) : '',
        'Invoiced Total': row.invoicedTotal !== null ? row.invoicedTotal.toFixed(2) : '',
        'Invoice #s': row.invoiceNumbers,
        'Invoice Payment': row.paidState,
        'Payment Status (manual)': paymentStatusLabel(computePaymentStatus(r)),
        'Voided Reason': r.status === 'voided' ? r.void_reason || '' : '',
      }
    })
    const csv = Papa.unparse(csvRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `po-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const COLS = 14

  return (
    <div className="card">
      <div className="card-header">
        <h2>PO Ledger ({rows.length} lines)</h2>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExportCsv} disabled={rows.length === 0}>
            Export CSV
          </button>
        </div>
      </div>
      <p className="sub" style={{ marginTop: 0 }}>
        What was purchased and how it's treated for accounting: spare parts are an inventory asset until used, parts used on
        site, consumables and services are expenses. Line amounts are before markup, shipping and tax; those are shown once
        per PO. Voided POs stay listed but are left out of the totals below.
      </p>

      <div className="header-actions" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="">All Entities</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option value={v.id} key={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={treatmentFilter} onChange={(e) => setTreatmentFilter(e.target.value)}>
          <option value="">All Treatments</option>
          {Object.entries(LEDGER_TREATMENT_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="sub" style={{ margin: 0 }}>
          Issued from{' '}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="sub" style={{ margin: 0 }}>
          to <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <input
          type="text"
          placeholder="Search PO #, vendor, part, invoice #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="header-actions" style={{ flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
        {Object.entries(LEDGER_TREATMENT_LABELS).map(([value, label]) => (
          <span key={value}>
            <strong>{label}:</strong> {fmtMoney(summary[value])}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">No purchase order lines match these filters.</div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr className="header-row">
                <th className="row-head">PO #</th>
                <th>Status</th>
                <th>Entity</th>
                <th>Vendor</th>
                <th>Issued</th>
                <th>Received / Done</th>
                <th>Line</th>
                <th className="center-cell">Qty</th>
                <th className="center-cell">Unit Cost</th>
                <th className="center-cell">Line Total</th>
                <th>Treatment</th>
                <th className="center-cell">PO Total</th>
                <th>Invoices</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const r = row.request
                const voided = r.status === 'voided'
                const struck = voided ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined
                return (
                  <Fragment key={row.key}>
                    <tr>
                      <td className="row-head">{row.first ? r.po_number || `#${r.id}` : ''}</td>
                      <td>{row.first ? poStatusLabel(r.status) : ''}</td>
                      <td>{row.first ? r.projects?.name || '—' : ''}</td>
                      <td>{row.first ? r.vendors?.name || '—' : ''}</td>
                      <td>{row.first ? fmtDate(row.issuedAt) || '—' : ''}</td>
                      <td>{row.first ? fmtDate(row.workDoneAt) || '—' : ''}</td>
                      <td style={struck}>{row.lineText}</td>
                      <td className="center-cell" style={struck}>
                        {Number(row.line.quantity) || 0}
                      </td>
                      <td className="center-cell" style={struck}>
                        {fmtMoney(row.line.unit_cost)}
                      </td>
                      <td className="center-cell" style={struck}>
                        {fmtMoney(row.lineTotal)}
                      </td>
                      <td>{LEDGER_TREATMENT_LABELS[row.treatment]}</td>
                      <td className="center-cell" style={struck}>
                        {row.poTotals ? fmtMoney(row.poTotals.grandTotal) : ''}
                      </td>
                      <td>
                        {row.first
                          ? [row.invoiceNumbers || null, row.paidState].filter(Boolean).join(' — ')
                          : ''}
                      </td>
                      <td className="center-cell">
                        {row.first && (
                          <button className="btn-secondary" onClick={() => toggleActivity(r.id)}>
                            {activityOpenId === r.id ? 'Hide' : 'Activity'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {row.first && activityOpenId === r.id && (
                      <tr>
                        <td colSpan={COLS}>
                          {voided && (
                            <div className="status err" style={{ marginTop: 0 }}>
                              Voided by {findUserName(users, r.voided_by)}
                              {r.voided_at ? ` — ${new Date(r.voided_at).toLocaleString()}` : ''}
                              {r.void_reason ? `: ${r.void_reason}` : ''}
                            </div>
                          )}
                          {!activity[r.id] ? (
                            <div className="empty">Loading…</div>
                          ) : activity[r.id].length === 0 ? (
                            <div className="empty">No activity logged for this PO.</div>
                          ) : (
                            <table className="sheet">
                              <tbody>
                                {activity[r.id].map((a) => (
                                  <tr key={a.id}>
                                    <td className="row-head">{new Date(a.created_at).toLocaleString()}</td>
                                    <td>{findUserName(users, a.user_id)}</td>
                                    <td style={{ whiteSpace: 'pre-line' }}>{a.note}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PoLedgerTab
