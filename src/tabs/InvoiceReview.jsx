// The "add invoice" step on a PO's Receipts & Invoices panel: the invoice
// number and amount read from the chosen PDF (editable), then how the invoice
// compares with the PO -- a checklist, and the two documents side by side with
// the figures that disagree boxed. Differences only ever warn: the invoice can
// always be added, since the reading can be wrong. See scrape/comparePo.js.

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

export default function InvoiceReview({ pending, request, busy, onChange, onSubmit, onCancel }) {
  const { file, receiptId, number, amount, scan, review } = pending
  const typedNumber = number.trim().toLowerCase()
  const duplicate =
    typedNumber && (request.invoices || []).some((inv) => (inv.invoice_number || '').trim().toLowerCase() === typedNumber)

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
      {duplicate && (
        <p className="inv-warn-text">⚠ Invoice #{number.trim()} is already on this PO — check this isn't a duplicate.</p>
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
