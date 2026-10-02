// The Vendor Approval role's queue: vendors people have requested that are
// still waiting for a decision. Each row says who asked and why, and flags
// existing vendors with a similar name so a duplicate can be rejected.
import { similarNames } from '../scrape/matchers'
import { findUserName, vendorApprovalStatus } from '../utils'

export default function VendorsToApproveTable({ vendors, users, onApprove, onReject }) {
  const pending = vendors.filter((v) => vendorApprovalStatus(v) === 'pending')
  const others = (v) => similarNames(v.name, vendors.filter((o) => o.id !== v.id && vendorApprovalStatus(o) !== 'rejected'))

  return (
    <div className="card">
      <div className="card-header">
        <h2>Vendors to Approve ({pending.length})</h2>
      </div>
      {pending.length === 0 ? (
        <div className="empty">No vendors are waiting for approval.</div>
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr className="header-row">
                <th>Vendor</th>
                <th>Requested by</th>
                <th>Contact</th>
                <th>Notes</th>
                <th>Similar existing vendors</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((v) => {
                const similar = others(v)
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      {v.address ? <div className="sub">{v.address}</div> : null}
                    </td>
                    <td>
                      {findUserName(users, v.requested_by)}
                      {v.requested_at ? <div className="sub">{new Date(v.requested_at).toLocaleDateString()}</div> : null}
                    </td>
                    <td>
                      {[v.contact_name, v.email, v.phone].filter(Boolean).map((t, i) => (
                        <div key={i}>{t}</div>
                      ))}
                      {!v.contact_name && !v.email && !v.phone ? '—' : null}
                    </td>
                    <td>{v.notes || '—'}</td>
                    <td>
                      {similar.length === 0 ? (
                        '—'
                      ) : (
                        <span style={{ color: 'var(--danger)' }}>⚠ {similar.map((s) => s.name).join(', ')}</span>
                      )}
                    </td>
                    <td className="nowrap-cell">
                      <button className="btn-primary po-action-btn" onClick={() => onApprove(v)}>
                        Approve
                      </button>{' '}
                      <button className="btn-secondary po-action-btn" onClick={() => onReject(v)}>
                        Reject
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
