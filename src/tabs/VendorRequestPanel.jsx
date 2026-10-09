// "Request a new vendor" -- used from the purchase request form's Vendor field
// and from the button beside New Request, so both open the same thing, on the
// same screen (a rec in progress keeps its lines and attached PDFs; leaving
// the page for a form elsewhere would risk them).
import { useState } from 'react'
import { similarNames } from '../scrape/matchers'
import { isVendorActive, vendorApprovalStatus } from '../utils'

const STATUS_WORDS = { pending: 'pending approval', rejected: 'rejected', inactive: 'deactivated — ask an admin to reactivate it' }

export default function VendorRequestPanel({ vendors, onSubmit, onClose, onUseExisting }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', address: '', notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // Near-duplicates are the usual way a vendor list gets messy, so say so
  // before the request goes in -- not a block, just a heads-up.
  const similar = form.name.trim().length >= 2 ? similarNames(form.name, vendors).slice(0, 5) : []

  async function submit() {
    setBusy(true)
    setError('')
    const result = await onSubmit(form)
    setBusy(false)
    if (result.error) setError(result.error)
    else onClose(result.vendor)
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <strong>Request a new vendor</strong>
      <p className="sub" style={{ margin: '4px 0 8px' }}>
        A vendor approver reviews it. You can pick it on a rec straight away, but the rec can&apos;t be approved, and its
        PO can&apos;t be issued, until the vendor is approved.
      </p>

      <label htmlFor="vendor_req_name">Vendor name</label>
      <input id="vendor_req_name" type="text" value={form.name} onChange={set('name')} autoFocus />

      {similar.length > 0 && (
        <div className="sub" style={{ margin: '6px 0 0' }}>
          ⚠ Similar vendor{similar.length === 1 ? '' : 's'} already in your list:
          {similar.map((v) => {
            const status = isVendorActive(v) ? vendorApprovalStatus(v) : 'inactive'
            return (
              <span key={v.id} style={{ marginLeft: 8 }}>
                <strong>{v.name}</strong>
                {STATUS_WORDS[status] ? ` (${STATUS_WORDS[status]})` : ''}
                {onUseExisting && status !== 'rejected' && status !== 'inactive' && (
                  <>
                    {' '}
                    <button type="button" className="btn-secondary" onClick={() => onUseExisting(v)}>
                      Use this one
                    </button>
                  </>
                )}
              </span>
            )
          })}
        </div>
      )}

      <div className="field-row" style={{ marginTop: 8 }}>
        <div>
          <label htmlFor="vendor_req_contact">Contact</label>
          <input id="vendor_req_contact" type="text" value={form.contact} onChange={set('contact')} />
        </div>
        <div>
          <label htmlFor="vendor_req_phone">Phone</label>
          <input id="vendor_req_phone" type="text" value={form.phone} onChange={set('phone')} />
        </div>
      </div>
      <label htmlFor="vendor_req_email" style={{ marginTop: 8 }}>
        Email
      </label>
      <input id="vendor_req_email" type="text" value={form.email} onChange={set('email')} />
      <label htmlFor="vendor_req_address" style={{ marginTop: 8 }}>
        Address
      </label>
      <input id="vendor_req_address" type="text" value={form.address} onChange={set('address')} />
      <label htmlFor="vendor_req_notes" style={{ marginTop: 8 }}>
        What do you need them for? (helps the approver)
      </label>
      <input id="vendor_req_notes" type="text" value={form.notes} onChange={set('notes')} />

      {error && (
        <div className="status err" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn-primary" onClick={submit} disabled={busy || !form.name.trim()}>
          {busy ? 'Requesting…' : 'Request vendor'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => onClose(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
