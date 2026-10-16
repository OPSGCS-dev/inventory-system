// Small pieces shared by the two Accounting Audit views (Inventory Counts and Prices).

export const GREEN = '#2f7a3d'
export const RED = '#b0402a'
export const AMBER = '#b98900'

export function Badge({ color, children }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, color, background: `${color}1a`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function Tile({ label, value, color, hint }) {
  return (
    <div style={{ flex: '1 1 150px', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--card)' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--ink)', lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}
