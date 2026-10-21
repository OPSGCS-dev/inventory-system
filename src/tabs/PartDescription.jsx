// A part's description as up to three distinct lines: what it is (bold), the model and rating, then any other
// details (smaller, muted). Each line is its own block, so a long line wraps under itself and the three never run
// together. An older one-line description is shown as plain text.
function PartDescription({ text }) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return '—'
  if (lines.length === 1) return lines[0]
  return (
    <div className="part-desc">
      <div className="part-desc-1">{lines[0]}</div>
      <div className="part-desc-2">{lines[1]}</div>
      {lines.slice(2).map((l, i) => (
        <div className="part-desc-3" key={i}>
          {l}
        </div>
      ))}
    </div>
  )
}

export default PartDescription
