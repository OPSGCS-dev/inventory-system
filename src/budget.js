import { computePoTotals, isNotToExceed } from './utils'

// The Budget tab's sums. Budgets come from `budget_amounts` (year + site + budget category, optionally a
// sub-category); spending is worked out here from the POs, so nothing about it is ever stored twice.
//
//   Issued POs      what the issued and closed POs commit: the PO total, or the cap on a Not to Exceed PO
//   Actual invoiced invoices approved for payment (paid ones included) on those POs
//   To be invoiced  what an issued PO still has to bill: its commitment less the invoices approved so far
//                   (nothing for a closed PO -- it is finished, so whatever it never billed is not coming)
//   Remaining       budget - actual invoiced - to be invoiced
//
// A PO counts in the year it was issued. Voided, draft, requested and rejected POs count for nothing.

export const BUDGET_PO_STATUSES = ['issued', 'closed']

const cents = (n) => Math.round((Number(n) || 0) * 100)
const money = (c) => c / 100

export const emptyAmounts = () => ({ budget: 0, hasBudget: false, pos: 0, invoiced: 0, toBe: 0, count: 0 })

export const remainingOf = (a) => (a.budget || 0) - a.invoiced - a.toBe

// What the PO commits us to.
export function poCommitment(request) {
  const cap = isNotToExceed(request) ? Number(request.spending_cap) || 0 : 0
  return cap > 0 ? cap : computePoTotals(request).grandTotal
}

// Invoices that count as spent: approved for payment, or already paid.
export function approvedInvoiceTotal(request) {
  return (request?.invoices || [])
    .filter((inv) => inv.approved || inv.paid)
    .reduce((sum, inv) => sum + cents(inv.amount), 0) / 100
}

// The year a PO belongs to: the day it was issued (older rows with no date fall back to when it was made).
export function poBudgetYear(request) {
  const when = request?.issued_at || request?.created_at
  if (!when) return null
  const d = new Date(when)
  return Number.isNaN(d.getTime()) ? null : d.getFullYear()
}

// One PO's contribution, in cents so the sums stay exact.
export function poSpend(request) {
  const committed = cents(poCommitment(request))
  const invoiced = cents(approvedInvoiceTotal(request))
  const toBe = request.status === 'closed' ? 0 : Math.max(0, committed - invoiced)
  return { committed, invoiced, toBe }
}

const add = (a, b) => {
  a.pos += b.pos
  a.invoiced += b.invoiced
  a.toBe += b.toBe
  a.count += b.count
  a.budget += b.budget
  a.hasBudget = a.hasBudget || b.hasBudget
}

const key = (siteId, categoryId, subId) => `${siteId}:${categoryId}:${subId || 0}`

// Builds everything the tab shows for one project (`programId`, or every category when there are no
// projects yet) and year.
//   sites      the sites with a budget that year, in name order
//   rows       one per budget category (+ one per sub-category that has a budget or spending, and a
//              "No budget category" row when a PO has none); each has `cells[siteId]` and `total`
//   totals     per-site TOTAL of the category rows, and `all` across every site
//   unbudgeted spending on sites that have no budget this year (so it is not lost, just not in a column)
export function buildBudgetReport({
  year,
  programId,
  purchaseRequests,
  budgetAmounts,
  budgetCategories,
  budgetSubcategories,
  projects,
  programSites,
  extraSiteIds = [],
}) {
  const categories = budgetCategories.filter((c) => !programId || c.program_id === programId)
  const categoryIds = new Set(categories.map((c) => c.id))
  const siteInProgram = (id) =>
    !programId || (programSites || []).some((ps) => ps.program_id === programId && ps.project_id === id)

  // Budget lookup, one program's categories and one year only.
  const budgets = new Map()
  const budgetSiteIds = new Set(extraSiteIds)
  for (const b of budgetAmounts) {
    if (b.year !== year || !categoryIds.has(b.category_id)) continue
    budgets.set(key(b.project_id, b.category_id, b.subcategory_id), Number(b.amount) || 0)
    budgetSiteIds.add(b.project_id)
  }

  const sites = projects
    .filter((p) => budgetSiteIds.has(p.id) && siteInProgram(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const siteIds = new Set(sites.map((s) => s.id))

  // Spending, by site / category / sub-category.
  const spend = new Map()
  const bump = (k, s) => {
    const cur = spend.get(k) || { pos: 0, invoiced: 0, toBe: 0, count: 0 }
    cur.pos += s.committed
    cur.invoiced += s.invoiced
    cur.toBe += s.toBe
    cur.count += 1
    spend.set(k, cur)
  }
  const poList = new Map() // key -> requests behind it, for the drill-down
  const unbudgeted = new Map() // siteId -> { pos, invoiced, toBe, count }
  let nonCadCount = 0
  for (const r of purchaseRequests) {
    if (!BUDGET_PO_STATUSES.includes(r.status)) continue
    if (poBudgetYear(r) !== year) continue
    if (programId && r.program_id && r.program_id !== programId) continue
    if (r.budget_category_id && !categoryIds.has(r.budget_category_id)) continue
    if (!r.budget_category_id && programId && !r.program_id) continue
    const s = poSpend(r)
    if (r.currency && r.currency.toUpperCase() !== 'CAD') nonCadCount += 1
    if (!siteIds.has(r.project_id)) {
      const cur = unbudgeted.get(r.project_id) || { pos: 0, invoiced: 0, toBe: 0, count: 0 }
      cur.pos += s.committed
      cur.invoiced += s.invoiced
      cur.toBe += s.toBe
      cur.count += 1
      unbudgeted.set(r.project_id, cur)
      continue
    }
    const cat = r.budget_category_id || 0
    bump(key(r.project_id, cat, 0), s)
    const listAdd = (k) => poList.set(k, [...(poList.get(k) || []), r])
    listAdd(key(r.project_id, cat, 0))
    if (r.budget_subcategory_id) {
      bump(key(r.project_id, cat, r.budget_subcategory_id), s)
      listAdd(key(r.project_id, cat, r.budget_subcategory_id))
    }
  }

  const cellFor = (siteId, categoryId, subId) => {
    const k = key(siteId, categoryId, subId)
    const s = spend.get(k)
    return {
      budget: budgets.get(k) || 0,
      hasBudget: budgets.has(k),
      pos: money(s?.pos || 0),
      invoiced: money(s?.invoiced || 0),
      toBe: money(s?.toBe || 0),
      count: s?.count || 0,
    }
  }

  const makeRow = (rowKey, label, categoryId, subId, level) => {
    const cells = {}
    const total = emptyAmounts()
    for (const s of sites) {
      cells[s.id] = cellFor(s.id, categoryId, subId)
      add(total, cells[s.id])
    }
    return { key: rowKey, label, categoryId, subId, level, cells, total }
  }

  const rows = []
  for (const c of categories) {
    rows.push(makeRow(`c${c.id}`, c.name, c.id, 0, 'category'))
    for (const sc of budgetSubcategories.filter((x) => x.category_id === c.id)) {
      const row = makeRow(`s${sc.id}`, sc.name, c.id, sc.id, 'sub')
      const any = row.total.hasBudget || row.total.count > 0
      if (any) rows.push(row)
    }
  }
  // POs with no category (old ones) still count, so the totals add up.
  const noCategory = makeRow('none', 'No budget category', 0, 0, 'category')
  if (noCategory.total.count > 0) rows.push(noCategory)

  const totals = { all: emptyAmounts() }
  for (const s of sites) totals[s.id] = emptyAmounts()
  for (const row of rows) {
    if (row.level !== 'category') continue
    for (const s of sites) {
      add(totals[s.id], row.cells[s.id])
      add(totals.all, row.cells[s.id])
    }
  }

  return {
    sites,
    rows,
    totals,
    unbudgeted: [...unbudgeted.entries()].map(([siteId, a]) => ({
      siteId,
      name: projects.find((p) => p.id === siteId)?.name || `Site ${siteId}`,
      pos: money(a.pos),
      invoiced: money(a.invoiced),
      toBe: money(a.toBe),
      count: a.count,
    })),
    nonCadCount,
    posFor: (siteId, categoryId, subId) => poList.get(key(siteId, categoryId, subId)) || [],
  }
}

// The years the year picker offers: any year with a budget, any year a PO was issued in, this year and next.
export function budgetYears(budgetAmounts, purchaseRequests) {
  const years = new Set([new Date().getFullYear(), new Date().getFullYear() + 1])
  for (const b of budgetAmounts) years.add(b.year)
  for (const r of purchaseRequests) {
    if (!BUDGET_PO_STATUSES.includes(r.status)) continue
    const y = poBudgetYear(r)
    if (y) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}
