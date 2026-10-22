// The "add invoice" step on a PO's Receipts & Invoices panel: the invoice
// number and amount read from the chosen PDF (editable), then how the invoice
// compares with the PO -- a checklist, and the two documents side by side with
// the figures that disagree boxed. Differences only ever warn: the invoice can
// always be added, since the reading can be wrong. See scrape/comparePo.js.

import { formatMoney, formatAmount, formatDate } from '../utils'
import { allocateInvoice } from '../invoiceSplit'
import { isBlockingDuplicate, MIN_DUPLICATE_REASON } from '../invoiceDuplicates'

const STATUS_LABEL = { ok: '✓ Matches', warn: '⚠ Check', info: 'ℹ Note' }

function DocView({ title, images, boxes }) {
  return (
    <div className="inv-doc">
      <div className="inv-doc-title">{title}</div>
      <div className="inv-doc-scroll">
        {images.map((src, i) => (
          <div className="inv-page" key={i}>
            <img src={src} alt={`${title}, page ${i + 1}`} />
            {boxes
              .filter((b) => b.page === i)
              .map((b, j) => (
                <span
                  key={j}
                  className="inv-hl"
                  style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const poLabel = (m) => m.po_number || 'a draft PO'
const matchLine = (m) =>
  `${poLabel(m)} — invoice ${m.invoice_number ? `#${m.invoice_number}` : '(no number)'}, ${formatMoney(m.amount)}, added ${formatDate(m.uploaded_at)}${m.paid ? ', paid' : ''}${m.po_status === 'voided' ? ' (voided PO)' : ''}`

export default function InvoiceReview({ pending, dupes, request, busy, onChange, onToggleItem, onSelectAllItems, onSubmit, onCancel }) {
  const { file, receiptId, number, amount, scan, review } = pending
  // The items on the invoice, and which of them this PO takes (everything unless some are unticked).
  const rows = pending.rows || []
  const selected = pending.selected || []
  const split = rows.length > 0 ? allocateInvoice(review?.extracted, rows, selected) : null
  const typedNumber = number.trim().toLowerCase()
  // Until add_invoice_duplicate_guard.sql is run there is no vendor-wide check, only this PO's invoices.
  const checked = dupes?.ready === true
  const samePoDuplicate =
    !checked &&
    typedNumber &&
    (request.invoices || []).some((inv) => (inv.invoice_number || '').trim().toLowerCase() === typedNumber)
  const sameNumber = checked ? dupes.matches.filter((m) => m.same_number) : []
  const sameAmount = checked ? dupes.matches.filter((m) => !m.same_number) : []
  const mustExplain = sameNumber.some(isBlockingDuplicate)
  const splitting = mustExplain && Boolean(pending.splitShared)
  const reasonShort = mustExplain && !splitting && (pending.dupReason || '').trim().length < MIN_DUPLICATE_REASON
  // When the same invoice is already on other POs: how much of it they hold, against the invoice's total.
  const otherShares = sameNumber.filter((m) => m.po_status !== 'voided')
  const otherTotal = otherShares.reduce((s, m) => s + (Number(m.amount) || 0), 0)
  const invoiceTotal = split?.documentTotal ?? null
  const overAllocated = splitting && invoiceTotal !== null && otherTotal + (Number(amount) || 0) > invoiceTotal + 0.005

  return (
    <div className="inv-review">
      <h3 style={{ margin: '0 0 4px' }}>
        {receiptId ? 'Add & match invoice' : 'Add invoice'} — {file.name}
      </h3>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        {scan.busy ? 'Reading the PDF…' : scan.note}
      </p>

      <div className="field-row">
        <div>
          <label htmlFor="inv_review_number">Invoice #</label>
          <input id="inv_review_number" type="text" value={number} onChange={(e) => onChange('number', e.target.value)} />
        </div>
        <div>
          <label htmlFor="inv_review_amount">Invoice Amount</label>
          <input
            id="inv_review_amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => onChange('amount', e.target.value)}
          />
        </div>
      </div>
      {rows.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Which items on this invoice are for this PO?</p>
          <p className="sub" style={{ margin: '0 0 6px' }}>
            Untick anything that belongs on another PO — for example shipping the vendor added after the PO was sent, which gets its own PO.
            The Invoice Amount above follows what is ticked (with the tax on it); you can still change it by hand.
          </p>
          <div className="sheet-wrap" style={{ maxHeight: 'none' }}>
            <table className="sheet">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col />
                <col style={{ width: '70px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th></th>
                  <th>Item on the invoice</th>
                  <th className="center-cell">Qty</th>
                  <th className="center-cell">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={selected.includes(r.key) ? undefined : { color: 'var(--muted)' }}>
                    <td className="center-cell">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.key)}
                        onChange={() => onToggleItem(r.key)}
                        aria-label={`This PO takes: ${r.label}`}
                      />
                    </td>
                    <td>
                      {r.partNumber ? <strong>{r.partNumber} </strong> : null}
                      {r.label}
                    </td>
                    <td className="center-cell">{r.quantity ?? ''}</td>
                    <td className="center-cell">{formatAmount(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ margin: '6px 0 0' }}>
            Ticked: {formatMoney(split.subtotal)}
            {split.tax > 0 ? ` + ${formatMoney(split.tax)} tax (${split.taxRate}%)` : ''} = <strong>{formatMoney(split.amount)}</strong> for this PO
            {invoiceTotal !== null ? ` — the whole invoice is ${formatMoney(invoiceTotal)}` : ''}.{' '}
            {split.partial ? (
              <button type="button" className="inv-undo" onClick={onSelectAllItems}>
                Tick everything
              </button>
            ) : null}
          </p>
          {review?.extracted?.lines && !review.extracted.lines.reconciled && (
            <p className="inv-warn-text" style={{ margin: '4px 0 0' }}>
              ⚠ The items read from the PDF don't add up to its subtotal — check them against the invoice before relying on this split.
            </p>
          )}
        </div>
      )}
      {pending.error && <p className="inv-warn-text">{pending.error}</p>}
      {samePoDuplicate && (
        <p className="inv-warn-text">⚠ Invoice #{number.trim()} is already on this PO — check this isn't a duplicate.</p>
      )}
      {sameNumber.length > 0 && (
        <div className="inv-warn-text" style={{ margin: '8px 0' }}>
          ⚠ Invoice #{number.trim()} from this vendor is already on file:
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {sameNumber.map((m) => (
              <li key={m.invoice_id}>{matchLine(m)}</li>
            ))}
          </ul>
          {mustExplain && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0' }}>
              <input
                type="checkbox"
                checked={Boolean(pending.splitShared)}
                onChange={(e) => onChange('splitShared', e.target.checked)}
              />
              This is the same invoice, split across POs — this PO takes only the items ticked above
            </label>
          )}
          {splitting && split && !split.partial && (
            <div style={{ marginTop: 6 }}>
              ⚠ Everything is ticked, so this PO would take the whole invoice. Untick the items that belong on the other PO.
            </div>
          )}
          {splitting && otherShares.length > 0 && (
            <div style={{ marginTop: 6 }}>
              Already on other POs: {formatMoney(otherTotal)}
              {invoiceTotal !== null ? ` of ${formatMoney(invoiceTotal)}, leaving ${formatMoney(Math.max(0, invoiceTotal - otherTotal))} for this PO` : ''}.
              {overAllocated ? ' ⚠ With this PO\'s amount that is more than the invoice.' : ''}
            </div>
          )}
          {mustExplain && !splitting && (
            <div style={{ marginTop: 8 }}>
              <label htmlFor="inv_review_dup_reason">This is a separate invoice, because…</label>
              <input
                id="inv_review_dup_reason"
                type="text"
                className={pending.error && reasonShort ? 'field-invalid' : undefined}
                placeholder="e.g. second invoice for the same number from the vendor's other branch"
                value={pending.dupReason || ''}
                onChange={(e) => onChange('dupReason', e.target.value)}
              />
              <span className="sub" style={{ margin: 0 }}>
                Required to add it. Saved with the invoice and shown in the PO History.
              </span>
            </div>
          )}
        </div>
      )}
      {sameAmount.length > 0 && (
        <div className="inv-warn-text" style={{ margin: '8px 0' }}>
          ⚠ Same vendor, same amount ({formatMoney(amount)}) in the last 90 days — check this isn't the same bill twice:
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {sameAmount.map((m) => (
              <li key={m.invoice_id}>{matchLine(m)}</li>
            ))}
          </ul>
        </div>
      )}

      {review && review.hasText && (
        <>
          <p className={review.warnCount > 0 ? 'inv-warn-text' : 'inv-ok-text'} style={{ margin: '12px 0 6px' }}>
            {review.warnCount > 0
              ? `⚠ ${review.warnCount} thing${review.warnCount === 1 ? '' : 's'} to check against the PO — the vendor may have sent the wrong invoice. You can still add it.`
              : '✓ Nothing on this invoice disagrees with the PO (as far as it could be read).'}
          </p>
          <div className="sheet-wrap">
            <table className="sheet">
              <colgroup>
                <col style={{ width: '17%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '12%' }} />
                <col />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th>Check</th>
                  <th>PO</th>
                  <th>Invoice</th>
                  <th>Result</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {review.checks.map((c) => (
                  <tr key={c.key} className={c.status === 'warn' ? 'inv-chk-warn' : undefined}>
                    <td>{c.label}</td>
                    <td>{c.po}</td>
                    <td>{c.invoice}</td>
                    <td>
                      <span className={`inv-status inv-status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {review.views === undefined && (
            <p className="sub" style={{ margin: '12px 0 6px' }}>
              Preparing the side-by-side view…
            </p>
          )}
          {review.views && (
            <>
              <p className="sub" style={{ margin: '12px 0 6px' }}>
                Side by side — figures that disagree are boxed in yellow on both documents.
              </p>
              <div className="inv-docs">
                <DocView {...review.views.po} />
                <DocView {...review.views.invoice} />
              </div>
            </>
          )}
        </>
      )}

      <div className="edit-toolbar" style={{ marginTop: 12 }}>
        <button className="btn-primary" onClick={onSubmit} disabled={busy || scan.busy}>
          {receiptId ? 'Add Invoice & Match' : 'Add Invoice'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
