import { useState } from 'react'
import { computePoTotals, formatMoney, poStatusLabel, truncate } from '../utils'
import { relatedRequests } from '../poLinks'

// The POs that belong with this one: those that share one of its invoices (same vendor, same invoice number --
// found automatically, e.g. a second PO raised for the shipping the vendor added to the invoice afterwards) and
// those linked by hand by PO number. Shown on a PO's page; a link made by hand can be removed again.
function RelatedPos({ request, purchaseRequests, poLinks, poLinksReady, canLink, busy, onOpenPo, onAddLink, onRemoveLink }) {
  const [text, setText] = useState('')
  const related = relatedRequests(request, purchaseRequests, poLinks)
  const showLinkForm = canLink && poLinksReady
  if (related.length === 0 && !showLinkForm) return null

  async function addLink() {
    if (!text.trim()) return
    const ok = await onAddLink(request, text)
    if (ok) setText('')
  }

  return (
    <div style={{ margin: '12px 0' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Related POs</p>
      {related.length === 0 ? (
        <p className="sub" style={{ margin: '0 0 6px' }}>
          None yet. A PO shows up here on its own when it has an invoice from the same vendor with the same invoice number (or the
          same invoice file); any other PO can be linked by number.
        </p>
      ) : (
        <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
          {related.map(({ request: other, reasons, linkId }) => {
            const link = linkId ? poLinks.find((l) => l.id === linkId) : null
            return (
              <li key={other.id} style={{ marginBottom: 4 }}>
                <button type="button" className="inv-undo" onClick={() => onOpenPo(other.id)} title="Open that PO">
                  {other.po_number || `#${other.id}`}
                </button>{' '}
                — {poStatusLabel(other.status)}, {formatMoney(computePoTotals(other).grandTotal)}
                {other.description ? ` — ${truncate(other.description, 50)}` : ''}{' '}
                <span className="sub" style={{ margin: 0 }}>
                  ({reasons.join(', ')})
                </span>
                {link && canLink && link.reason !== 'regenerated' && (
                  <>
                    {' '}
                    <button type="button" className="inv-undo" disabled={busy} onClick={() => onRemoveLink(link)}>
                      Unlink
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {showLinkForm && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="PO number to link, e.g. PO-11-26-002"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addLink()
            }}
            style={{ maxWidth: 280 }}
            aria-label="PO number to link"
          />
          <button type="button" className="btn-secondary" disabled={busy || !text.trim()} onClick={addLink}>
            Link PO
          </button>
        </div>
      )}
    </div>
  )
}

export default RelatedPos
