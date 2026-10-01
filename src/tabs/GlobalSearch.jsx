import { useMemo, useState } from 'react'

// Searches whatever's already loaded in memory (purchase requests + parts)
// -- no new queries -- so it's cheap to keep mounted everywhere. Covers PO
// number/description/vendor and part GCS ID/Part ID/description.
export default function GlobalSearch({ purchaseRequests, parts, onSelectPo, onSelectPart }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { pos: [], matchingParts: [] }
    const pos = purchaseRequests
      .filter(
        (r) =>
          (r.po_number || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.vendors?.name || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
    const matchingParts = parts
      .filter(
        (p) =>
          String(p.gcs_id).includes(q) ||
          (p.gcs_part_id || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
    return { pos, matchingParts }
  }, [query, purchaseRequests, parts])

  const hasResults = results.pos.length > 0 || results.matchingParts.length > 0

  return (
    <div
      className="global-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <input
        type="text"
        placeholder="Search POs or parts…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="global-search-input"
      />
      {open && query.trim() && (
        <div className="global-search-dropdown">
          {!hasResults && <div className="global-search-empty">No matches.</div>}
          {results.pos.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Purchase Orders</div>
              {results.pos.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="global-search-result"
                  onClick={() => {
                    onSelectPo(r.id)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  <strong>{r.po_number || `#${r.id}`}</strong> — {r.description || r.vendors?.name || '—'}
                </button>
              ))}
            </div>
          )}
          {results.matchingParts.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Parts</div>
              {results.matchingParts.map((p) => (
                <button
                  key={p.gcs_id}
                  type="button"
                  className="global-search-result"
                  onClick={() => {
                    onSelectPart(p)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  <strong>{p.gcs_part_id}</strong> — {p.description}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
