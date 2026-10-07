// Shared helpers for the Ownership and Physical Location tabs.
//
// A "location key" names one physical place: 'storage', 'barn', or 'site:<entity id>'
// (the site that entity owns). It's what the location dropdowns hold.
import { shortProjectName } from './utils'

// PostgREST returns at most 1,000 rows per request, silently. Read a table in pages so a
// list that grows past that is never cut off. `build` makes a fresh query each call;
// order by a unique key so pages don't overlap.
export async function fetchAllRows(build, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

export const STORAGE = 'storage'
export const BARN = 'barn'
export const siteKey = (projectId) => `site:${projectId}`

export function parseLocKey(key) {
  if (key === STORAGE || key === BARN) return { location: key, projectId: null }
  const m = /^site:(\d+)$/.exec(key || '')
  return m ? { location: 'site', projectId: Number(m[1]) } : { location: null, projectId: null }
}

export function locKeyOf(location, projectId) {
  return location === 'site' ? siteKey(projectId) : location
}

export function locLabel(key, projects) {
  if (key === STORAGE) return 'Storage'
  if (key === BARN) return 'Barn'
  const { projectId } = parseLocKey(key)
  const p = (projects || []).find((x) => x.id === projectId)
  return p ? `${shortProjectName(p.name)} site` : 'Unknown site'
}

// How many of a part sit in one place (a location key).
export function qtyAt(item, key) {
  if (!item?.loc) return 0
  if (key === STORAGE) return item.loc.storage || 0
  if (key === BARN) return item.loc.barn || 0
  const { projectId } = parseLocKey(key)
  return item.loc.site?.[projectId] || 0
}

export const ownedBy = (item, projectId) => item?.perProject?.[projectId]?.onHand ?? 0

// Units an entity owns that are NOT on its own site (so they're in Storage or the Barn).
export const offSiteUnits = (item, projectId) => ownedBy(item, projectId) - (item?.loc?.site?.[projectId] || 0)

export const totalOwned = (item) => Object.values(item?.perProject || {}).reduce((s, p) => s + (p.onHand || 0), 0)

// Every place, in display order: Storage, Barn, then each entity's site.
export function allLocationKeys(projects) {
  return [STORAGE, BARN, ...(projects || []).map((p) => siteKey(p.id))]
}

// The database's messages are already written to be read; just tidy a missing-function case.
export function rpcErrorText(error, fallback) {
  const msg = error?.message || ''
  if (/Could not find the function|schema cache|does not exist/i.test(msg)) {
    return 'The database is missing the ownership/location functions. Run supabase/ownership_location_01_schema.sql in the Inventory project\'s SQL editor first.'
  }
  return msg || fallback
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
