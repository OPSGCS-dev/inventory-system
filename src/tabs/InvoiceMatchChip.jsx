import { compareInvoicesToPo, invoiceMatchText } from '../utils'

// A tiny marker showing whether what's been invoiced against a PO lines up
// with the PO: = (matches), ▲ (invoiced more than the PO), ▼ (less so far).
// Hover for the numbers. Renders nothing until there is an invoice.
const LOOK = {
  over: { symbol: '▲', color: 'var(--danger)', bg: '#fde2e2', word: 'over' },
  under: { symbol: '▼', color: 'var(--warn)', bg: '#fdf1d6', word: 'under' },
  equal: { symbol: '=', color: 'var(--success)', bg: '#e6f4ea', word: 'equal' },
}

function InvoiceMatchChip({ request }) {
  const match = compareInvoicesToPo(request)
  if (!match) return null
  const look = LOOK[match.state]
  return (
    <span
      title={invoiceMatchText(match)}
      aria-label={invoiceMatchText(match)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        marginLeft: 4,
        borderRadius: '50%',
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        color: look.color,
        background: look.bg,
        verticalAlign: 'middle',
        cursor: 'default',
      }}
    >
      {look.symbol}
    </span>
  )
}

export default InvoiceMatchChip
