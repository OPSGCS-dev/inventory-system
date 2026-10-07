// Compares the spreadsheet's ownership numbers (after your overrides) with what the app currently has.
//
//   node scripts/compare_sheet_to_app.mjs "<sheet .xlsm>" "<app export .csv>" [report.md]
//
// The app export is Inventory On Hand -> Update Inventory Count -> "Export Current Inventory (CSV)"
// (columns: GCS P/N, Entity, Quantity). Read-only: writes a markdown report, touches nothing else.
// Shows exactly what importing the sheet would change, so nothing is overwritten by surprise.

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { loadOpeningData } from './lib/opening_data.mjs'

const require = createRequire(import.meta.url)
const Papa = require('papaparse')

const [xlsxPath, csvPath, outPath = 'compare_report.md'] = process.argv.slice(2)
if (!xlsxPath || !csvPath) {
  console.error('Usage: node scripts/compare_sheet_to_app.mjs "<sheet .xlsm>" "<app export .csv>" [report.md]')
  process.exit(1)
}

const data = loadOpeningData(xlsxPath, (p) => console.error('Sheet rows need a decision first:\n  - ' + p.join('\n  - ')))
if (!data) process.exit(2)
const { config, ownerRows } = data

// ILIKE pattern (%x%) -> regex
const toRegex = (pat) => new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
const siteRegexes = Object.entries(config.sites).map(([site, pats]) => [site, pats.map(toRegex)])

const parsed = Papa.parse(readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true })
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const fields = parsed.meta.fields || []
const fm = Object.fromEntries(fields.map((f) => [norm(f), f]))
const gcsKey = fm.gcspn || fm.gcsid || fm.gcs
const entKey = fm.entity || fm.project || fm.site
const qtyKey = fm.quantity || fm.qty || fm.stockonhand
if (!gcsKey || !entKey || !qtyKey) {
  console.error('The CSV needs columns GCS P/N, Entity and Quantity. Found: ' + fields.join(', '))
  process.exit(1)
}

const entityToSite = new Map()
const unmapped = new Set(), ambiguous = new Map()
const appMap = new Map()
for (const row of parsed.data) {
  const name = String(row[entKey]).trim()
  if (!entityToSite.has(name)) {
    const hits = siteRegexes.filter(([, rs]) => rs.some((r) => r.test(name))).map(([s]) => s)
    if (hits.length === 1) entityToSite.set(name, hits[0])
    else { entityToSite.set(name, null); if (hits.length === 0) unmapped.add(name); else ambiguous.set(name, hits) }
  }
  const site = entityToSite.get(name)
  if (!site) continue
  const gcs = parseInt(row[gcsKey], 10)
  const qty = parseInt(row[qtyKey], 10)
  if (Number.isNaN(gcs) || Number.isNaN(qty)) continue
  appMap.set(`${site}|${gcs}`, (appMap.get(`${site}|${gcs}`) || 0) + qty)
}
const sheetMap = new Map()
for (const o of ownerRows) sheetMap.set(`${o.site}|${o.gcs}`, (sheetMap.get(`${o.site}|${o.gcs}`) || 0) + o.qty)

const keys = new Set([...sheetMap.keys(), ...appMap.keys()])
const diffs = []
const totals = {}
for (const k of keys) {
  const [site, gcs] = k.split('|')
  const s = sheetMap.get(k) || 0, a = appMap.get(k) || 0
  totals[site] ||= { sheet: 0, app: 0 }
  totals[site].sheet += s; totals[site].app += a
  if (s !== a) diffs.push({ site, gcs: Number(gcs), sheet: s, app: a, delta: s - a })
}
diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.gcs - y.gcs)
const sheetHigher = diffs.filter((d) => d.delta > 0 && d.app > 0).length
const sheetLower = diffs.filter((d) => d.delta < 0 && d.sheet > 0).length
const onlySheet = diffs.filter((d) => d.app === 0).length
const onlyApp = diffs.filter((d) => d.sheet === 0).length

let md = `# Sheet vs app: ownership comparison\n\n`
md += `Sheet: \`${config.sheet}\` (${config.sheetDate}), after the overrides in opening_import_config.json.\n`
md += `App: ${parsed.data.length} rows from the exported CSV.\n\n`
md += `## What importing the sheet would change\n\n`
md += `- Part/entity pairs that differ: **${diffs.length}** of ${keys.size}\n`
md += `- Sheet higher than the app (both have stock): ${sheetHigher}\n- Sheet lower than the app (sheet has stock): ${sheetLower}\n`
md += `- In the sheet only (app has 0 or no row): ${onlySheet}\n- In the app only (sheet has 0): ${onlyApp} — these would become 0\n\n`
md += `## Totals by entity\n\n| Entity | App | Sheet | Change |\n|---|---:|---:|---:|\n`
for (const [site, t] of Object.entries(totals).sort()) md += `| ${site} | ${t.app} | ${t.sheet} | ${t.sheet - t.app >= 0 ? '+' : ''}${t.sheet - t.app} |\n`
if (unmapped.size) md += `\n**App entities that matched no sheet site** (their stock would be zeroed by the import): ${[...unmapped].join(', ')}\n`
if (ambiguous.size) md += `\n**App entities matching more than one sheet site** (fix patterns in opening_import_config.json): ${[...ambiguous].map(([n, h]) => `${n} → ${h.join(' / ')}`).join('; ')}\n`
md += `\n## Entity name mapping used\n\n| App entity | Sheet site |\n|---|---|\n${[...entityToSite].map(([n, s]) => `| ${n} | ${s ?? '(none)'} |`).join('\n')}\n`
md += `\n## Largest differences (first 80)\n\n| P/N | Entity | App | Sheet | Change |\n|---:|---|---:|---:|---:|\n`
for (const d of diffs.slice(0, 80)) md += `| ${d.gcs} | ${d.site} | ${d.app} | ${d.sheet} | ${d.delta >= 0 ? '+' : ''}${d.delta} |\n`
if (diffs.length > 80) md += `\n…and ${diffs.length - 80} more. Full list is below the cut in compare_full.csv.\n`

writeFileSync(outPath, md)
writeFileSync(outPath.replace(/\.md$/, '') + '_full.csv', Papa.unparse(diffs.map((d) => ({ 'GCS P/N': d.gcs, Entity: d.site, App: d.app, Sheet: d.sheet, Change: d.delta }))))
console.log(`Wrote ${outPath}`)
console.log(`${diffs.length} of ${keys.size} part/entity pairs differ (sheet higher: ${sheetHigher}, lower: ${sheetLower}, sheet only: ${onlySheet}, app only: ${onlyApp})`)
if (unmapped.size) console.log('Unmapped app entities:', [...unmapped].join(', '))
