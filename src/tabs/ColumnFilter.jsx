import { useEffect, useMemo, useRef, useState } from 'react'

// Excel-style column filters for the list tables: a small ▾ on a column heading opens a list of that
// column's values with tick boxes (search box, Select all), and the table keeps only the rows whose
// value is ticked. Several columns can be filtered at once; each column's list only offers values
// that the *other* columns' filters still leave, like Excel.
//
//   const columns = useMemo(() => [{ key: 'vendor', values: (row) => row.vendors?.name }, ...], [...])
//   const filters = useColumnFilters(rows, columns, resetKey)
//   <FilterTh filters={filters} col="vendor">Vendor</FilterTh>          (in the header row)
//   <ColumnFilterBar filters={filters} />                                (above the table)
//   ...render filters.filtered
//
// A column's `values(row)` is the text the row shows there (or an array of them, for a cell that shows
// several); nothing there counts as "(Blanks)". Optional `sort(a, b)` orders the list (default: A-Z,
// numbers by size). `resetKey` clears every filter when it changes (e.g. when the page's view changes).

export const BLANK = '(Blanks)'
const NO_FILTERS = {}

const cellValues = (col, row) => {
  const v = col.values(row)
  const out = (Array.isArray(v) ? v : [v]).map((x) => (x === null || x === undefined || String(x).trim() === '' ? BLANK : String(x)))
  return out.length ? out : [BLANK]
}

// For lists of money: "$1,234.50" -> 1234.5.
export const byAmount = (a, b) => (parseFloat(a.replace(/[^0-9.-]/g, '')) || 0) - (parseFloat(b.replace(/[^0-9.-]/g, '')) || 0)

const byText = (a, b) => {
  if (a === BLANK) return 1
  if (b === BLANK) return -1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function useColumnFilters(rows, columns, resetKey = '') {
  const [state, setState] = useState({ resetKey, selected: NO_FILTERS })
  // Filters belong to one view of the list: another view starts clean.
  const selected = state.resetKey === resetKey ? state.selected : NO_FILTERS

  const passes = (row, skipKey) =>
    columns.every((c) => c.key === skipKey || !selected[c.key] || cellValues(c, row).some((v) => selected[c.key].has(v)))

  const filtered = useMemo(
    () => rows.filter((row) => columns.every((c) => !selected[c.key] || cellValues(c, row).some((v) => selected[c.key].has(v)))),
    [rows, columns, selected]
  )

  // The values a column offers, with how many rows each has, given every *other* column's filter.
  function optionsFor(key) {
    const col = columns.find((c) => c.key === key)
    if (!col) return []
    const counts = new Map()
    for (const row of rows) {
      if (!passes(row, key)) continue
      for (const v of new Set(cellValues(col, row))) counts.set(v, (counts.get(v) || 0) + 1)
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => (col.sort ? col.sort(a.value, b.value) : byText(a.value, b.value)))
  }

  // `values` = the ticked values, or null for "everything" (no filter on that column).
  function setSelected(key, values) {
    const next = { ...selected }
    if (values === null) delete next[key]
    else next[key] = values
    setState({ resetKey, selected: next })
  }

  const activeKeys = columns.filter((c) => selected[c.key]).map((c) => c.key)
  return {
    filtered,
    columns,
    selected,
    optionsFor,
    setSelected,
    isActive: (key) => Boolean(selected[key]),
    activeKeys,
    clearAll: () => setState({ resetKey, selected: NO_FILTERS }),
    total: rows.length,
  }
}

function FilterPopover({ filters, col, anchor, onClose }) {
  const [search, setSearch] = useState('')
  const popRef = useRef(null)
  const options = filters.optionsFor(col)
  const chosen = filters.selected[col] || null // null = every value
  const shown = options.filter((o) => o.value.toLowerCase().includes(search.trim().toLowerCase()))
  const isTicked = (v) => (chosen ? chosen.has(v) : true)
  const allShownTicked = shown.length > 0 && shown.every((o) => isTicked(o.value))

  // Placed under the ▾, kept inside the window.
  const WIDTH = 240
  const left = Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8))
  const top = anchor.bottom + 4

  useEffect(() => {
    const away = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose()
    }
    const key = (e) => e.key === 'Escape' && onClose()
    // The list is placed on the screen, so scrolling the page or the table moves the heading away from it.
    const scrolled = (e) => {
      if (!popRef.current || !popRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function commit(next) {
    // Everything ticked is the same as no filter.
    filters.setSelected(col, next.size >= options.length && options.every((o) => next.has(o.value)) ? null : next)
  }

  function toggle(value) {
    const base = new Set(chosen || options.map((o) => o.value))
    if (base.has(value)) base.delete(value)
    else base.add(value)
    commit(base)
  }

  function toggleShown() {
    const base = new Set(chosen || options.map((o) => o.value))
    for (const o of shown) {
      if (allShownTicked) base.delete(o.value)
      else base.add(o.value)
    }
    commit(base)
  }

  return (
    <div ref={popRef} className="colfilter-pop" style={{ left, top, width: WIDTH }} role="dialog" aria-label="Filter column">
      <input
        type="text"
        className="colfilter-search"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="colfilter-list">
        {shown.length === 0 ? (
          <div className="colfilter-empty">No matches</div>
        ) : (
          <>
            <label className="colfilter-item colfilter-all">
              <input type="checkbox" checked={allShownTicked} onChange={toggleShown} />
              <span>{search.trim() ? 'Select all matches' : 'Select all'}</span>
            </label>
            {shown.map((o) => (
              <label className="colfilter-item" key={o.value}>
                <input type="checkbox" checked={isTicked(o.value)} onChange={() => toggle(o.value)} />
                <span className="colfilter-value" title={o.value}>
                  {o.value}
                </span>
                <span className="colfilter-count">{o.count}</span>
              </label>
            ))}
          </>
        )}
      </div>
      <div className="colfilter-foot">
        <button type="button" className="btn-secondary" disabled={!chosen} onClick={() => filters.setSelected(col, null)}>
          Clear filter
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

// A column heading with the filter button: <FilterTh filters={filters} col="vendor">Vendor</FilterTh>.
// Extra props (className, style, ...) go to the <th>.
export function FilterTh({ filters, col, children, ...rest }) {
  const [anchor, setAnchor] = useState(null)
  const active = filters.isActive(col)
  return (
    <th {...rest}>
      <span className="colfilter-head">
        <span className="colfilter-label">{children}</span>
        <button
          type="button"
          className={'colfilter-btn' + (active ? ' active' : '')}
          title={active ? 'Filtered — click to change' : 'Filter this column'}
          aria-label={'Filter ' + (filters.columns.find((c) => c.key === col)?.label || 'column')}
          aria-expanded={Boolean(anchor)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setAnchor((a) => (a ? null : { right: r.right, bottom: r.bottom }))
          }}
        >
          ▾
        </button>
      </span>
      {anchor && <FilterPopover filters={filters} col={col} anchor={anchor} onClose={() => setAnchor(null)} />}
    </th>
  )
}

// "Filtered by Vendor, Entity — Clear filters", shown above a table while any column is filtered.
export function ColumnFilterBar({ filters, shown }) {
  if (filters.activeKeys.length === 0) return null
  const labelOf = (key) => filters.columns.find((c) => c.key === key)?.label || key
  return (
    <div className="colfilter-bar">
      <span>
        Filtered by <strong>{filters.activeKeys.map(labelOf).join(', ')}</strong>
        {shown !== undefined && (
          <>
            {' '}
            — showing {shown} of {filters.total}
          </>
        )}
      </span>
      <button type="button" className="btn-secondary" onClick={filters.clearAll}>
        Clear filters
      </button>
    </div>
  )
}
