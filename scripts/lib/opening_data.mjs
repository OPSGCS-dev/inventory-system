// Reads the OPS - GM SPARE PART LIST sheet and applies the ownership / location rules.
// Shared by build_opening_import.mjs and compare_sheet_to_app.mjs.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const here = path.dirname(fileURLToPath(import.meta.url))

export function loadConfig() {
  return JSON.parse(readFileSync(path.join(here, '..', 'opening_import_config.json'), 'utf8'))
}

// Returns { config, blocks, ownerRows, finalLoc, notes }; calls onProblems(list) and returns null if rows can't be placed.
export function loadOpeningData(xlsxPath, onProblems) {
  const config = loadConfig()
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[config.sheet]
  if (!ws) throw new Error(`Sheet "${config.sheet}" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  
  // Site blocks sit on the row above the column headers; STOCK ON HAND is the 6th column of each 8-wide block.
  const siteRow = rows[3]
  const blocks = []
  siteRow.forEach((c, i) => {
    if (c && i >= 10) blocks.push({ col: i, key: String(c).replace(/^\d+\.\s*/, '').trim().toUpperCase() })
  })
  const SOH = 5
  for (const b of blocks) {
    if (!config.sites[b.key]) throw new Error(`Site "${b.key}" is in the sheet but not in opening_import_config.json -> sites`)
  }
  for (const k of Object.keys(config.sites)) {
    if (!blocks.some((b) => b.key === k)) throw new Error(`Site "${k}" is in the config but not in the sheet`)
  }
  const shortOf = (key) => key.replace(/\s*\(.*\)\s*/, '').trim()
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase()
  
  const partRows = rows.slice(5).filter((r) => r[0] !== '' && !Number.isNaN(Number(r[0])))
  const ownerRows = [] // { site, gcs, qty }
  const locRows = []   // { location: 'site'|'storage'|'barn', site|null, gcs, qty }
  const problems = []
  const notes = []
  
  for (const r of partRows) {
    const gcs = Number(r[0])
    const ov = config.overrides[String(gcs)] || {}
    const owners = new Map()
    for (const b of blocks) {
      const raw = r[b.col + SOH]
      if (raw === '' || raw === null || raw === undefined) continue
      let q = Number(raw)
      if (Number.isFinite(q) && Number.isInteger(q) && q < 0) {
        // A used-more-than-received cell in the sheet: nothing can own a negative quantity.
        notes.push(`P/N ${gcs}: stock on hand for ${b.key} is ${q} in the sheet (more used than received); imported as 0`)
        q = 0
      }
      if (!Number.isFinite(q) || q < 0 || !Number.isInteger(q)) {
        problems.push(`P/N ${gcs}: stock on hand for ${b.key} is "${raw}", not a whole number of zero or more`)
        continue
      }
      if (q > 0) owners.set(b.key, q)
    }
    if (ov.moveOwnership) {
      const { from, to } = ov.moveOwnership
      const q = owners.get(from) || 0
      if (q > 0) {
        owners.delete(from)
        owners.set(to, (owners.get(to) || 0) + q)
        notes.push(`P/N ${gcs}: ownership of ${q} moved ${from} -> ${to} (override)`)
      }
    }
    if (owners.size === 0) continue
  
    const locText = norm(r[6])
    const named = locText.split('/').map((s) => shortOf(norm(s)))
    for (const [site, qty] of owners) {
      ownerRows.push({ site, gcs, qty })
      if (ov.storage) {
        locRows.push({ location: 'storage', site: null, gcs, qty })
      } else if (locText === 'ON SITE') {
        locRows.push({ location: 'site', site, gcs, qty })
      } else if (locText.startsWith('STORAGE')) {
        locRows.push({ location: 'storage', site: null, gcs, qty })
      } else if (locText === '') {
        problems.push(`P/N ${gcs}: ${site} owns ${qty} but Primary Location is blank (add an override)`)
      } else if (named.includes(shortOf(site))) {
        locRows.push({ location: 'site', site, gcs, qty })
      } else {
        problems.push(`P/N ${gcs}: ${site} owns ${qty} but Primary Location says "${locText}" (add an override)`)
      }
    }
  }
  
  if (problems.length) {
    if (onProblems) onProblems(problems)
    return null
  }
  
  // Combine duplicate (location, site, part) rows.
  const mergedLoc = new Map()
  for (const l of locRows) {
    const k = `${l.location}|${l.site ?? ''}|${l.gcs}`
    mergedLoc.set(k, { ...l, qty: (mergedLoc.get(k)?.qty || 0) + l.qty })
  }
  const finalLoc = [...mergedLoc.values()]
  
  // Self-check: for every part, sum of ownership = sum of locations, and no site holds more than it owns.
  const sumO = new Map(), sumL = new Map(), ownMap = new Map()
  for (const o of ownerRows) { sumO.set(o.gcs, (sumO.get(o.gcs) || 0) + o.qty); ownMap.set(`${o.site}|${o.gcs}`, o.qty) }
  for (const l of finalLoc) {
    sumL.set(l.gcs, (sumL.get(l.gcs) || 0) + l.qty)
    if (l.location === 'site' && l.qty > (ownMap.get(`${l.site}|${l.gcs}`) || 0)) {
      throw new Error(`Internal check failed: ${l.site} would hold more of P/N ${l.gcs} than it owns`)
    }
  }
  for (const [g, q] of sumO) if (sumL.get(g) !== q) throw new Error(`Internal check failed: P/N ${g} ownership ${q} vs locations ${sumL.get(g)}`)
  
  
  return { config, blocks, ownerRows, finalLoc, notes }
}
