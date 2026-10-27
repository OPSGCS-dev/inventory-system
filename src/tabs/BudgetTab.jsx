import { Fragment, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { buildBudgetReport, budgetYears, emptyAmounts, poSpend, remainingOf } from '../budget'
import { downloadCsv } from '../stockUtils'
import { formatAmountWhole, formatDate, formatMoney, poStatusLabel } from '../utils'

// Budget against spending, per site: what each budget category was given for the year, what the issued POs
// commit, what has been invoiced (invoices approved for payment) and what is left. The sums are in
// src/budget.js; budgets are edited here by an admin and saved to budget_amounts.

const SUB_COLUMNS = [
  { id: 'budget', label: 'Budget [$]' },
  { id: 'pos', label: 'Issued POs [$]', drill: true },
  { id: 'invoiced', label: 'Actual Invoiced [$]', drill: true },
  { id: 'toBe', label: 'To be invoiced [$]', drill: true },
  { id: 'remaining', label: 'Remaining [$]' },
]

// "1,234", "-1,234", and a dash for nothing (so a page of mostly empty cells stays readable).
const show = (n) => {
  const rounded = Math.round(Number(n) || 0)
  return rounded === 0 ? '–' : formatAmountWhole(rounded)
}

const cellKey = (siteId, categoryId, subId) => `${siteId}:${categoryId}:${subId || 0}`

function valueOf(a, id) {
  return id === 'remaining' ? remainingOf(a) : a[id]
}

function BudgetTab({
  purchaseRequests,
  projects,
  programs = [],
  programSites = [],
  budgetCategories,
  budgetSubcategories,
  budgetAmounts,
  budgetReady,
  canEdit,
  onSaveBudget,
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [view, setView] = useState('detail') // 'detail' | 'summary'
  const [showSubs, setShowSubs] = useState(true)
  const [drill, setDrill] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({}) // cellKey -> typed text, only for cells the admin touched
  const [extraSiteIds, setExtraSiteIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Until add_projects_layer.sql has been run there are no projects, and every category belongs to one budget.
  const activeProgramId = programs.some((g) => g.id === programId) ? programId : programs[0]?.id ?? null

  const report = useMemo(
    () =>
      buildBudgetReport({
        year,
        programId: activeProgramId,
        purchaseRequests,
        budgetAmounts,
        budgetCategories,
        budgetSubcategories,
        projects,
        programSites,
        extraSiteIds: editing ? extraSiteIds : [],
      }),
    [year, activeProgramId, purchaseRequests, budgetAmounts, budgetCategories, budgetSubcategories, projects, programSites, editing, extraSiteIds]
  )

  const years = useMemo(() => budgetYears(budgetAmounts, purchaseRequests), [budgetAmounts, purchaseRequests])

  const visibleRows = report.rows.filter((r) => showSubs || r.level !== 'sub')
  const blocks = [{ id: 'all', name: 'All sites' }, ...report.sites.map((s) => ({ id: s.id, name: s.name }))]
  const categoryRows = report.rows.filter((r) => r.level === 'category')

  function flash(ok, msg) {
    setStatus({ ok, msg })
    setTimeout(() => setStatus(null), ok ? 3000 : 10000)
  }

  // ---- drill-down: the POs behind a number ----
  const drillRequests = useMemo(() => {
    if (!drill) return []
    const siteIds = drill.siteId === 'all' ? report.sites.map((s) => s.id) : [drill.siteId]
    const seen = new Set()
    const found = []
    for (const id of siteIds) {
      for (const r of report.posFor(id, drill.categoryId, drill.subId)) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          found.push(r)
        }
      }
    }
    return found.sort((a, b) => String(a.po_number || '').localeCompare(String(b.po_number || '')))
  }, [drill, report])

  // ---- export ----
  function exportCsv() {
    const out = []
    for (const row of visibleRows) {
      for (const s of report.sites) {
        const a = row.cells[s.id]
        if (!a.hasBudget && a.count === 0) continue
        out.push({
          Year: year,
          Project: programs.find((g) => g.id === activeProgramId)?.name || '',
          Site: s.name,
          'Budget Category': row.level === 'sub' ? budgetCategories.find((c) => c.id === row.categoryId)?.name || '' : row.label,
          'Sub-category': row.level === 'sub' ? row.label : '',
          Budget: a.hasBudget ? a.budget.toFixed(2) : '',
          'Issued POs': a.pos.toFixed(2),
          'Actual Invoiced': a.invoiced.toFixed(2),
          'To be invoiced': a.toBe.toFixed(2),
          Remaining: remainingOf(a).toFixed(2),
        })
      }
    }
    downloadCsv(`budget-${year}-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(out))
  }

  // ---- editing ----
  const original = (siteId, categoryId, subId) => {
    const row = budgetAmounts.find(
      (b) =>
        b.year === year &&
        b.project_id === siteId &&
        b.category_id === categoryId &&
        (b.subcategory_id || 0) === (subId || 0)
    )
    return row ? String(Number(row.amount)) : ''
  }

  function startEditing() {
    setDraft({})
    setExtraSiteIds([])
    setEditing(true)
    setDrill(null)
  }

  const inputValue = (siteId, categoryId, subId) => {
    const k = cellKey(siteId, categoryId, subId)
    return k in draft ? draft[k] : original(siteId, categoryId, subId)
  }

  function setCell(siteId, categoryId, subId, text) {
    setDraft((d) => ({ ...d, [cellKey(siteId, categoryId, subId)]: text }))
  }

  // Fills every empty cell of the shown sites from the same cell last year.
  function copyFromPreviousYear() {
    const previous = budgetAmounts.filter((b) => b.year === year - 1)
    const next = { ...draft }
    const newSites = new Set()
    let filled = 0
    for (const b of previous) {
      if (!budgetCategories.some((c) => c.id === b.category_id && (!activeProgramId || c.program_id === activeProgramId))) continue
      const k = cellKey(b.project_id, b.category_id, b.subcategory_id)
      const has = k in next ? next[k] !== '' : original(b.project_id, b.category_id, b.subcategory_id) !== ''
      if (!has) {
        next[k] = String(Number(b.amount))
        filled += 1
        if (!report.sites.some((s) => s.id === b.project_id)) newSites.add(b.project_id)
      }
    }
    setDraft(next)
    if (newSites.size > 0) setExtraSiteIds((ids) => [...new Set([...ids, ...newSites])])
    flash(true, filled ? `Filled ${filled} empty amount${filled === 1 ? '' : 's'} from ${year - 1}. Press Save to keep them.` : `Nothing to copy from ${year - 1}.`)
  }

  async function save() {
    const entries = []
    for (const [k, text] of Object.entries(draft)) {
      const [siteId, categoryId, subId] = k.split(':').map(Number)
      const trimmed = String(text).trim().replace(/,/g, '')
      if (trimmed === (original(siteId, categoryId, subId) || '')) continue
      if (trimmed !== '' && !Number.isFinite(Number(trimmed))) {
        flash(false, `"${text}" is not an amount.`)
        return
      }
      entries.push({
        projectId: siteId,
        categoryId,
        subcategoryId: subId || null,
        amount: trimmed === '' ? null : Number(trimmed),
      })
    }
    if (entries.length === 0) {
      setEditing(false)
      return
    }
    setSaving(true)
    const result = await onSaveBudget(year, entries)
    setSaving(false)
    if (result.ok) {
      setEditing(false)
      setDraft({})
      flash(true, result.message)
    } else {
      flash(false, result.message)
    }
  }

  const siteChoices = projects
    .filter(
      (p) =>
        !report.sites.some((s) => s.id === p.id) &&
        (!activeProgramId || programSites.some((ps) => ps.program_id === activeProgramId && ps.project_id === p.id))
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!budgetReady) {
    return (
      <div className="card">
        <h2>Budget</h2>
        <p className="muted">
          The budget isn't set up yet. An admin needs to run <code>supabase/add_budget_amounts.sql</code> in the Supabase
          SQL editor (after <code>add_projects_layer.sql</code>); it also loads the 2026 budget.
        </p>
      </div>
    )
  }

  const editCategories = report.rows.filter((r) => r.level === 'category' && r.key !== 'none')
  const subsOf = (categoryId) => budgetSubcategories.filter((s) => s.category_id === categoryId)

  return (
    <div className="card budget-card">
      <div className="card-header">
        <h2>Budget</h2>
        <div className="budget-controls">
          {programs.length > 0 && (
            <label>
              Project{' '}
              <select value={activeProgramId ?? ''} disabled={editing} onChange={(e) => { setProgramId(Number(e.target.value)); setDrill(null) }}>
                {programs.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Year{' '}
            <select value={year} disabled={editing} onChange={(e) => { setYear(Number(e.target.value)); setDrill(null) }}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          {!editing && (
            <>
              <span className="budget-view-switch">
                <button className={'sub-tab-btn' + (view === 'detail' ? ' active' : '')} onClick={() => setView('detail')}>By site</button>
                <button className={'sub-tab-btn' + (view === 'summary' ? ' active' : '')} onClick={() => { setView('summary'); setDrill(null) }}>Remaining summary</button>
              </span>
              {view === 'detail' && (
                <label>
                  <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} /> Show sub-category lines
                </label>
              )}
              <button className="btn-secondary" onClick={exportCsv} disabled={report.sites.length === 0}>Export CSV</button>
              {canEdit && <button className="btn-primary" onClick={startEditing}>Edit budget</button>}
            </>
          )}
        </div>
      </div>

      {status && <div className={'status ' + (status.ok ? 'ok' : 'err')}>{status.msg}</div>}

      {editing ? (
        <>
          <p className="muted budget-note">
            Editing the {year} budget{activeProgramId ? ` for ${programs.find((g) => g.id === activeProgramId)?.name}` : ''}. Leave an
            amount empty for "not budgeted". A site's column disappears again if all its amounts are emptied.
          </p>
          <div className="edit-toolbar">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button>
            <button className="btn-secondary" onClick={() => { setEditing(false); setDraft({}) }} disabled={saving}>Cancel</button>
            <button className="btn-secondary" onClick={copyFromPreviousYear} disabled={saving}>Fill empty amounts from {year - 1}</button>
            {siteChoices.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && setExtraSiteIds((ids) => [...ids, Number(e.target.value)])}
                aria-label="Add a site to this budget"
              >
                <option value="">Add a site…</option>
                {siteChoices.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="budget-scroll">
            <table className="budget-table budget-edit">
              <thead>
                <tr>
                  <th className="budget-cat-col">Budget Category</th>
                  {report.sites.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editCategories.map((row) => (
                  <Fragment key={row.key}>
                    <tr className="budget-row-category">
                      <th className="budget-cat-col">{row.label}</th>
                      {report.sites.map((s) => (
                        <td key={s.id}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={inputValue(s.id, row.categoryId, 0)}
                            onChange={(e) => setCell(s.id, row.categoryId, 0, e.target.value)}
                            aria-label={`${row.label} budget for ${s.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                    {subsOf(row.categoryId).map((sc) => (
                      <tr key={sc.id} className="budget-row-sub">
                        <td className="budget-cat-col">{sc.name}</td>
                        {report.sites.map((s) => (
                          <td key={s.id}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={inputValue(s.id, row.categoryId, sc.id)}
                              onChange={(e) => setCell(s.id, row.categoryId, sc.id, e.target.value)}
                              aria-label={`${sc.name} budget for ${s.name}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : report.sites.length === 0 ? (
        <p className="empty">
          No budget has been entered for {year}{activeProgramId ? ` in ${programs.find((g) => g.id === activeProgramId)?.name}` : ''}.
          {canEdit ? ' Press Edit budget to add one.' : ''}
        </p>
      ) : view === 'detail' ? (
        <div className="budget-scroll">
          <table className="budget-table">
            <thead>
              <tr>
                <th rowSpan={2} className="budget-cat-col budget-corner">Budget Category</th>
                {blocks.map((b) => (
                  <th key={b.id} colSpan={SUB_COLUMNS.length} className="budget-site-head">{b.name}</th>
                ))}
              </tr>
              <tr>
                {blocks.map((b) =>
                  SUB_COLUMNS.map((c) => (
                    <th key={`${b.id}-${c.id}`} className={'budget-col-head' + (c.id === 'remaining' ? ' budget-remaining-head' : '')}>{c.label}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="budget-row-total">
                <th className="budget-cat-col">TOTAL</th>
                {blocks.map((b) =>
                  SUB_COLUMNS.map((c) => {
                    const v = valueOf(report.totals[b.id] || emptyAmounts(), c.id)
                    return (
                      <td key={`${b.id}-${c.id}`} className={'num' + (c.id === 'remaining' ? ' budget-remaining' : '') + (c.id === 'remaining' && Math.round(v) < 0 ? ' budget-neg' : '')}>
                        {show(v)}
                      </td>
                    )
                  })
                )}
              </tr>
              {visibleRows.map((row) => (
                <tr key={row.key} className={row.level === 'sub' ? 'budget-row-sub' : 'budget-row-category'}>
                  <th className="budget-cat-col">{row.label}</th>
                  {blocks.map((b) => {
                    const a = b.id === 'all' ? row.total : row.cells[b.id]
                    return SUB_COLUMNS.map((c) => {
                      const v = valueOf(a, c.id)
                      // A sub-category line is a breakdown of its category's budget: with no amount of its own it has no "remaining".
                      const noRemaining = c.id === 'remaining' && row.level === 'sub' && !a.hasBudget
                      const canDrill = c.drill && a.count > 0
                      const cls =
                        'num' +
                        (c.id === 'remaining' ? ' budget-remaining' : '') +
                        (c.id === 'remaining' && !noRemaining && Math.round(v) < 0 ? ' budget-neg' : '') +
                        (canDrill ? ' budget-drill' : '')
                      return (
                        <td
                          key={`${b.id}-${c.id}`}
                          className={cls}
                          title={canDrill ? `Show the ${a.count} PO${a.count === 1 ? '' : 's'} behind this` : undefined}
                          onClick={canDrill ? () => setDrill({ siteId: b.id, siteName: b.name, categoryId: row.categoryId, subId: row.subId, label: row.label, column: c.label }) : undefined}
                        >
                          {noRemaining ? '–' : show(v)}
                        </td>
                      )
                    })
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="budget-scroll">
          <table className="budget-table budget-summary">
            <thead>
              <tr>
                <th className="budget-cat-col budget-corner">Remaining funds</th>
                {categoryRows.map((r) => (
                  <th key={r.key} className="budget-col-head">{r.label}</th>
                ))}
                <th className="budget-col-head">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...report.sites.map((s) => ({ id: s.id, name: s.name })), { id: 'all', name: 'All sites' }].map((b) => (
                <tr key={b.id} className={b.id === 'all' ? 'budget-row-total' : ''}>
                  <th className="budget-cat-col">{b.name}</th>
                  {[...categoryRows.map((r) => (b.id === 'all' ? r.total : r.cells[b.id])), report.totals[b.id]].map((a, i) => {
                    const remaining = remainingOf(a)
                    const spent = a.invoiced + a.toBe
                    const none = !a.hasBudget && spent === 0
                    return (
                      <td key={i} className={'num' + (!none && Math.round(remaining) < 0 ? ' budget-neg' : '')} title={a.hasBudget ? `Budget ${formatMoney(a.budget)}, committed ${formatMoney(spent)}` : undefined}>
                        {none ? '–' : show(remaining)}
                        {a.budget > 0 && spent > 0 && <div className="budget-pct">{Math.round((spent / a.budget) * 100)}% used</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!editing && drill && (
        <div className="budget-drill-panel">
          <div className="budget-drill-head">
            <strong>
              {drill.column.replace(' [$]', '')}: {drill.siteName} — {drill.label}
            </strong>
            <button className="btn-secondary" onClick={() => setDrill(null)}>Close</button>
          </div>
          <table className="budget-table budget-drill-table">
            <thead>
              <tr>
                <th>PO</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Issued PO [$]</th>
                <th>Invoiced [$]</th>
                <th>To be invoiced [$]</th>
              </tr>
            </thead>
            <tbody>
              {drillRequests.map((r) => {
                const s = poSpend(r)
                return (
                  <tr key={r.id}>
                    <td>{r.po_number || `#${r.id}`}</td>
                    <td>{r.vendors?.name || ''}</td>
                    <td>{poStatusLabel(r.status)}</td>
                    <td>{r.issued_at ? formatDate(r.issued_at) : ''}</td>
                    <td className="num">{show(s.committed / 100)}</td>
                    <td className="num">{show(s.invoiced / 100)}</td>
                    <td className="num">{show(s.toBe / 100)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!editing && report.unbudgeted.length > 0 && (
        <p className="muted budget-note">
          Not in the table, because the site has no {year} budget:{' '}
          {report.unbudgeted
            .map((u) => `${u.name} — ${formatMoney(u.pos)} on ${u.count} PO${u.count === 1 ? '' : 's'}`)
            .join('; ')}
          .
        </p>
      )}
      {!editing && report.nonCadCount > 0 && (
        <p className="muted budget-note">
          {report.nonCadCount} PO{report.nonCadCount === 1 ? ' is' : 's are'} not in CAD and counted at face value (there is no
          exchange rate in the system).
        </p>
      )}
      {!editing && report.sites.length > 0 && (
        <p className="muted budget-note">
          Issued POs: issued and closed POs, in the year they were issued (a Not to Exceed PO counts at its cap). Actual
          invoiced: invoices approved for payment, paid ones included. To be invoiced: what an issued PO has yet to bill
          (nothing once it is closed). Remaining = budget − actual invoiced − to be invoiced.
        </p>
      )}
    </div>
  )
}

export default BudgetTab
