import { useMemo, useState } from 'react'
import { shortProjectName } from '../utils'
import { BARN, OFFICE, STORAGE, hasSiteStock, offSiteUnits, qtyAt, siteKey } from '../stockUtils'
import PartDescription from './PartDescription'

// Two small prompts that ask WHERE the physical units go (add_stock_location_choice.sql):
//   ReceiveLocationDialog       marking a PO's parts Received -- one place for the spare lines on the PO
//   AdjustmentLocationDialog    saving an individual ownership adjustment -- one place per changed count
// Places are 'site' (the owner's own site), 'storage' (Oshawa), 'barn' and 'office'.

const placeName = (value, project) =>
  value === 'site'
    ? `${shortProjectName(project?.name || '')} site (its own)`
    : value === STORAGE ? 'Oshawa' : value === BARN ? 'Barn' : 'Office'

// The places an entity's units can be put: its own site (only if it keeps parts on one), Oshawa, Barn, Office.
export function placeChoices(project) {
  const list = [STORAGE, BARN, OFFICE]
  return hasSiteStock(project) ? ['site', ...list] : list
}

function Shell({ title, children, onCancel, wide }) {
  return (
    <div className="img-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="img-modal loc-dialog" style={wide ? { maxWidth: 'min(94vw, 860px)', width: '100%' } : undefined} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="img-modal-close" onClick={onCancel} aria-label="Close">×</button>
        <h3 style={{ margin: '0 28px 8px 0', fontSize: 16 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function ReceiveLocationDialog({ request, project, parts, busy, onConfirm, onCancel }) {
  const [place, setPlace] = useState('')
  const lines = useMemo(() => {
    const byPart = new Map()
    for (const l of request?.purchase_request_lines || []) {
      if (l.line_type !== 'part' || !l.part_gcs_id) continue
      if (['used_immediately', 'consumable', 'transfer'].includes(l.inventory_action)) continue
      byPart.set(l.part_gcs_id, (byPart.get(l.part_gcs_id) || 0) + (Number(l.quantity) || 0))
    }
    return [...byPart.entries()].map(([gcs, qty]) => ({ gcs, qty, part: (parts || []).find((p) => p.gcs_id === gcs) }))
  }, [request, parts])

  return (
    <Shell title={`Receive parts on ${request.po_number || '#' + request.id}`} onCancel={busy ? () => {} : onCancel}>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        These spare parts are added to {project?.name || 'the site'}&apos;s count. Choose where the units are now. You can move them later with Update Location.
      </p>
      <table className="sheet" style={{ marginBottom: 12 }}>
        <thead>
          <tr className="header-row"><th className="row-head">GCS P/N</th><th>Description</th><th className="center-cell">Qty</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.gcs}>
              <td className="row-head">{l.gcs}</td>
              <td><PartDescription text={l.part?.description || '—'} /></td>
              <td className="center-cell">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="edit-toolbar">
        <span className="sub" style={{ margin: 0 }}>Put them in:</span>
        <select value={place} onChange={(e) => setPlace(e.target.value)} disabled={busy}>
          <option value="">Choose a location…</option>
          {placeChoices(project).map((v) => <option value={v} key={v}>{placeName(v, project)}</option>)}
        </select>
        <button className="btn-primary" disabled={!place || busy} onClick={() => onConfirm(place)}>
          {busy ? 'Saving…' : 'Mark Received'}
        </button>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </Shell>
  )
}

// changes: [{ key, gcs_id, part, project, item, from, to }]. onConfirm gets { [key]: location | null } where null
// means "automatic" (decreases only: the site's own shelf first, then Oshawa, Barn, Office).
export function AdjustmentLocationDialog({ changes, busy, onConfirm, onCancel }) {
  const [picked, setPicked] = useState({})

  // Which places a change can use, and why not.
  const optionsFor = (c) => {
    const delta = c.to - c.from
    if (delta > 0) return placeChoices(c.project).map((v) => ({ value: v, disabled: false, why: '' }))
    const take = -delta
    const out = []
    for (const v of placeChoices(c.project)) {
      const here = v === 'site' ? qtyAt(c.item, siteKey(c.project.id)) : Math.min(qtyAt(c.item, v), offSiteUnits(c.item, c.project.id))
      out.push({ value: v, disabled: here < take, why: here < take ? ` (only ${Math.max(here, 0)} there)` : ` (${here} there)` })
    }
    out.push({ value: 'auto', disabled: false, why: '' })
    return out
  }
  const labelFor = (c, o) => (o.value === 'auto' ? 'Automatic (own site first, then Oshawa, Barn, Office)' : placeName(o.value, c.project) + o.why)

  function setAll(value) {
    if (!value) return
    setPicked((prev) => {
      const next = { ...prev }
      for (const c of changes) {
        const o = optionsFor(c).find((x) => x.value === value)
        if (o && !o.disabled) next[c.key] = value
      }
      return next
    })
  }
  const complete = changes.every((c) => picked[c.key])

  return (
    <Shell title="Where are these units?" onCancel={busy ? () => {} : onCancel} wide>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        Choose the physical location for each change before it is saved. Extra units are put there; removed units are taken from there.
      </p>
      <div className="edit-toolbar" style={{ marginBottom: 8 }}>
        <span className="sub" style={{ margin: 0 }}>Set every row to:</span>
        <select value="" onChange={(e) => setAll(e.target.value)} disabled={busy}>
          <option value="">Choose…</option>
          <option value={STORAGE}>Oshawa</option>
          <option value={BARN}>Barn</option>
          <option value={OFFICE}>Office</option>
          <option value="site">Each site&apos;s own shelf</option>
        </select>
        <span className="sub" style={{ margin: 0 }}>(rows where that isn&apos;t possible are left for you to choose)</span>
      </div>
      <div className="sheet-wrap" style={{ maxHeight: '50vh', overflow: 'auto' }}>
        <table className="sheet">
          <thead>
            <tr className="header-row">
              <th className="row-head">GCS P/N</th><th>Description</th><th>Site</th>
              <th className="center-cell">Count</th><th>Location</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.key}>
                <td className="row-head">{c.gcs_id}</td>
                <td><PartDescription text={c.part?.description || '—'} /></td>
                <td>{shortProjectName(c.project.name)}</td>
                <td className="center-cell" style={{ whiteSpace: 'nowrap' }}>
                  {c.from} → {c.to} ({c.to > c.from ? '+' : ''}{c.to - c.from})
                </td>
                <td>
                  <select value={picked[c.key] || ''} disabled={busy} onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.value }))}>
                    <option value="">{c.to > c.from ? 'Put them in…' : 'Take them from…'}</option>
                    {optionsFor(c).map((o) => <option value={o.value} key={o.value} disabled={o.disabled}>{labelFor(c, o)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="edit-toolbar" style={{ marginTop: 12 }}>
        <button className="btn-primary" disabled={!complete || busy}
          onClick={() => onConfirm(Object.fromEntries(changes.map((c) => [c.key, picked[c.key] === 'auto' ? null : picked[c.key]])))}>
          {busy ? 'Saving…' : `Confirm & Save (${changes.length})`}
        </button>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>Back</button>
      </div>
    </Shell>
  )
}
