import { useState } from 'react'
import { todayLocal } from '../utils'

// Accounting's "I've paid this one": the date it was paid and an optional reference
// (cheque, EFT or transaction number), confirmed one invoice at a time. Used on the
// Invoices to Pay list and on a PO's Receipts & Invoices table.
export default function PaymentConfirm({ onConfirm, busy }) {
  const [paidDate, setPaidDate] = useState(todayLocal)
  const [reference, setReference] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input
        type="date"
        aria-label="Date paid"
        value={paidDate}
        max={todayLocal()}
        onChange={(e) => setPaidDate(e.target.value)}
        style={{ maxWidth: 140 }}
      />
      <input
        type="text"
        aria-label="Payment reference"
        placeholder="Reference (optional)"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        style={{ maxWidth: 160 }}
      />
      <button
        className="btn-primary"
        disabled={busy || !paidDate}
        onClick={() => onConfirm({ paidDate, reference: reference.trim() })}
      >
        Confirm Paid
      </button>
    </div>
  )
}
