// The "add invoice" step on a PO's Receipts & Invoices panel: the invoice
// number and amount read from the chosen PDF (editable), then how the invoice
// compares with the PO -- a checklist, and the two documents side by side with
// the figures that disagree boxed. Differences only ever warn: the invoice can
// always be added, since the reading can be wrong. See scrape/comparePo.js.

import { formatMoney, formatDate } from '../utils'
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

export default function InvoiceReview({ pending, dupes, request, busy, onChange, onSubmit, onCancel }) {
  const { file, receiptId, number, amount, scan, review } = pending
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
  const reasonShort = mustExplain && (pending.dupReason || '').trim().length < MIN_DUPLICATE_REASON

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
