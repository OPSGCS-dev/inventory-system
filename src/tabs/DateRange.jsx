import { useMemo, useState } from 'react'

// A timestamp as the local calendar day, YYYY-MM-DD (what a date input holds).
export const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '')

// Date filter + sort for a list. `getTime(item)` is the item's timestamp (ISO string or null).
// Filtering is a range of days, both ends inclusive (the same day in both boxes is that one day);
// an item with no date drops out as soon as a range is set. Sorting starts in the list's own order;
// the first click on the header shows newest first, then it flips.
export function useDateRange(items, getTime) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dir, setDir] = useState(null) // null | 'desc' | 'asc'

  const listed = useMemo(() => {
    let list = items
    if (from) list = list.filter((it) => localDay(getTime(it)) >= from)
    if (to) list = list.filter((it) => localDay(getTime(it)) <= to)
    if (!dir) return list
    const sign = dir === 'asc' ? 1 : -1
    const ms = (it) => (getTime(it) ? new Date(getTime(it)).getTime() : 0)
    return [...list].sort((a, b) => (ms(a) - ms(b)) * sign)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTime is a stable accessor
  }, [items, from, to, dir])

  return {
    listed,
    from,
    to,
    dir,
    setFrom,
    setTo,
    toggleDir: () => setDir((d) => (d === 'desc' ? 'asc' : 'desc')),
    clear: () => {
      setFrom('')
      setTo('')
    },
    filtered: Boolean(from || to),
  }
}

// The From / To boxes (and Clear) for a card header.
export function DateRangeFilter({ range, what = 'dated' }) {
  return (
    <>
      <label className="po-date-filter" title={`Show items ${what} on or after this date`}>
        From
        <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => range.setFrom(e.target.value)} />
      </label>
      <label className="po-date-filter" title={`Show items ${what} on or before this date`}>
        To
        <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => range.setTo(e.target.value)} />
      </label>
      {range.filtered && (
        <button type="button" className="btn-secondary" onClick={range.clear}>
          Clear dates
        </button>
      )}
    </>
  )
}

// A column header that sorts by the date when clicked.
export function DateSortHeader({ range, label }) {
  return (
    <th aria-sort={range.dir === 'asc' ? 'ascending' : range.dir === 'desc' ? 'descending' : 'none'}>
      <button type="button" className="sort-btn" title="Click to sort by date" onClick={range.toggleDir}>
        {label} {range.dir === 'asc' ? '▲' : range.dir === 'desc' ? '▼' : '↕'}
      </button>
    </th>
  )
}
