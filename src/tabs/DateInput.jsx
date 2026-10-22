import { useRef, useState } from 'react'
import { formatDate, parseTypedDate } from '../utils'

// A date box that always reads yyyy/mm/dd -- the browser's own date input shows whatever the computer's
// language settings say. You can type the date, or press the calendar button for the browser's picker.
// `value` and what `onChange` gets are yyyy-mm-dd (or '' for no date), so it's a drop-in for
// <input type="date">; `min` / `max` are yyyy-mm-dd too.
function DateInput({ value, onChange, min, max, disabled, style, 'aria-label': ariaLabel }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const picker = useRef(null)

  const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max)

  function type(next) {
    setText(next)
    if (next.trim() === '') {
      onChange('')
      return
    }
    const iso = parseTypedDate(next)
    if (iso && inRange(iso)) onChange(iso)
  }

  function openPicker() {
    const el = picker.current
    if (!el || disabled) return
    if (el.showPicker) el.showPicker()
    else el.focus()
  }

  return (
    <span className="date-input" style={style}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="yyyy/mm/dd"
        aria-label={ariaLabel}
        disabled={disabled}
        value={editing ? text : formatDate(value)}
        onFocus={() => {
          setText(formatDate(value))
          setEditing(true)
        }}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setEditing(false)}
      />
      <button type="button" className="date-input-btn" aria-label="Pick a date" title="Pick a date" disabled={disabled} onClick={openPicker}>
        📅
      </button>
      <input
        ref={picker}
        type="date"
        className="date-input-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  )
}

export default DateInput
