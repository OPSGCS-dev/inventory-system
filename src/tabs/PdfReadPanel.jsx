// The "Read from the PDF" review box on the purchase request form. Shows what
// was found in an attached quote/invoice, one checkbox per item, and applies
// the checked ones to the form on request -- never silently overwriting
// anything the person has already entered.

export default function PdfReadPanel({ read, onToggle, onApply, onDismiss }) {
  if (!read) return null
  const anyChecked = read.items.some((i) => i.checked)
  return (
    <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--surface-2, #f7f8fa)' }}>
      <strong>Read from {read.fileName}</strong>
      {read.items.length === 0 ? (
        <p className="sub" style={{ margin: '6px 0 0' }}>
          {read.emptyNote}
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
            {read.items.map((item) => (
              <li key={item.key} style={{ margin: '4px 0' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', cursor: 'pointer' }}>
                  <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.key)} />
                  <span>
                    <strong>{item.label}:</strong> {item.value}
                    {item.current ? <span className="sub"> (now: {item.current})</span> : null}
                    {item.warn ? <span style={{ color: 'var(--danger, #b3261e)' }}> ⚠ {item.warn}</span> : null}
                  </span>
                </label>
                {item.lines && (
                  <table className="sheet" style={{ margin: '6px 0 0 24px', width: 'calc(100% - 24px)' }}>
                    <thead>
                      <tr className="header-row">
                        <th>Part / Description</th>
                        <th className="center-cell">Qty</th>
                        <th className="center-cell">Unit</th>
                        <th className="center-cell">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.lines.map((l, i) => (
                        <tr key={i}>
                          <td>
                            {l.partNumber ? <strong>{l.partNumber} </strong> : null}
                            {l.description}
                          </td>
                          <td className="center-cell">{l.quantity}</td>
                          <td className="center-cell">{l.unitPrice.toFixed(2)}</td>
                          <td className="center-cell">{l.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
          {read.notes.map((n, i) => (
            <p className="sub" key={i} style={{ margin: '4px 0' }}>
              {n}
            </p>
          ))}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {read.items.length > 0 && (
          <button type="button" className="btn-primary" disabled={!anyChecked} onClick={onApply}>
            Apply checked to form
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onDismiss}>
          {read.items.length > 0 ? 'Dismiss' : 'Close'}
        </button>
      </div>
    </div>
  )
}
