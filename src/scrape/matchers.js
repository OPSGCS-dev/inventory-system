// Matches text read from a PDF against the app's own lists -- entities,
// sites (sub-projects), vendors and parts. A match must be unambiguous: if
// two different records fit equally well, or none do, nothing is filled in.
// Pure functions over plain data, so they can be run from a Node script.

import { buildRows } from './extractDocument.js'

// Legal-form words that vary between "SunE Hwy 2 S LP" and "SunE Hwy 2 S".
const IGNORED = new Set(['lp', 'llc', 'inc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'incorporated', 'the'])
// "Hwy 2S", "Hwy 2 S" and "Highway 2 South" are all the same name.
const SYNONYMS = { hwy: 'highway', hw: 'highway', s: 'south', n: 'north', e: 'east', w: 'west' }

export function nameTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, (_m, a, b) => `${a ?? b} `) // "2s" -> "2 s"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => !IGNORED.has(t))
}

// Every cell of text on the pages, tokenised once.
function pageCells(pages, maxPages) {
  const cells = []
  pages.slice(0, maxPages).forEach((page) => {
    buildRows(page.items).forEach((row) => {
      row.cells.forEach((c) => cells.push({ text: c.text, tokens: new Set(nameTokens(c.text)) }))
    })
  })
  return cells
}

function matchByName(records, cells, { minTokens = 2 } = {}) {
  const hits = []
  for (const rec of records) {
    const tokens = nameTokens(rec.name)
    // A name that's one common word would match half the page; require at
    // least two words, or a word containing a digit ("500 Bayly" qualifies).
    if (tokens.length < minTokens && !tokens.some((t) => /\d/.test(t))) continue
    if (tokens.length === 0) continue
    if (cells.some((c) => tokens.every((t) => c.tokens.has(t)))) hits.push(rec)
  }
  return hits.length === 1 ? hits[0] : null
}

// `records` are { id, name } rows (entities, vendors) read as-is from the app.
export function matchEntity(pages, entities) {
  return matchByName(entities, pageCells(pages, 2))
}

export function matchVendor(pages, vendors) {
  return matchByName(vendors, pageCells(pages, 1), { minTokens: 1 })
}

// Sites only make sense inside the matched entity.
export function matchSubProject(pages, subProjects) {
  return matchByName(subProjects, pageCells(pages, 1))
}

const normPart = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// A vendor part number against the master list's manufacturer P/N or GCS part
// ID. Exact match after stripping punctuation, and only if it's unique.
export function matchPart(partNumber, parts) {
  const key = normPart(partNumber)
  if (key.length < 4) return null
  const hits = parts.filter((p) => normPart(p.manufacturer_part_number) === key || normPart(p.gcs_part_id) === key)
  return hits.length === 1 ? hits[0] : null
}
