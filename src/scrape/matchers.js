// Matches text read from a PDF against the app's own lists -- entities,
// sites (sub-projects), vendors and parts. When several records fit, the most
// specific one wins; if two fit equally well, or none do, nothing is filled in.
// Pure functions over plain data, so they can be run from a Node script.

import { buildRows } from './extractDocument.js'

// Legal-form words that vary between "SunE Hwy 2 S LP" and "SunE Hwy 2 S".
const IGNORED = new Set(['lp', 'llc', 'inc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'incorporated', 'the'])
// "Hwy 2S", "Hwy 2 S" and "Highway 2 South" are all the same name.
const SYNONYMS = { hwy: 'highway', hw: 'highway', s: 'south', n: 'north', e: 'east', w: 'west' }

export function nameTokens(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, (_m, a, b) => `${a ?? b} `) // "2s" -> "2 s"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  // Initials written with dots ("R.K. Solar") are the same as "RK Solar".
  return runsToInitials(raw)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => !IGNORED.has(t))
}

// Joins runs of two or more single letters: [r, k, solar] -> [rk, solar]. A
// lone letter ("2 S") is left alone so it can still read as a direction.
function runsToInitials(tokens) {
  const out = []
  let run = []
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''))
    else out.push(...run)
    run = []
  }
  for (const t of tokens) {
    if (t.length === 1 && /[a-z]/.test(t)) run.push(t)
    else {
      flush()
      out.push(t)
    }
  }
  flush()
  return out
}

// Every cell of text on the pages, tokenised once. `top` marks the letterhead
// area (the upper part of the first page), where a vendor's name lives.
function pageCells(pages, maxPages) {
  const cells = []
  pages.slice(0, maxPages).forEach((page, pageIdx) => {
    buildRows(page.items).forEach((row) => {
      row.cells.forEach((c) =>
        cells.push({
          text: c.text,
          tokens: new Set(nameTokens(c.text)),
          top: pageIdx === 0 && row.y <= (page.height || 792) * 0.3,
        })
      )
    })
  })
  return cells
}

function matchByName(records, cells, { minTokens = 2, reverse = false } = {}) {
  const scored = []
  for (const rec of records) {
    const tokens = nameTokens(rec.name)
    // A name that's one common word would match half the page; require at
    // least two words, or a word containing a digit ("500 Bayly" qualifies).
    if (tokens.length === 0) continue
    if (tokens.length < minTokens && !tokens.some((t) => /\d/.test(t))) continue
    const set = new Set(tokens)
    let score = 0
    for (const c of cells) {
      if (tokens.every((t) => c.tokens.has(t))) {
        score = Math.max(score, tokens.length)
      } else if (reverse && c.top && c.tokens.size >= 2 && [...c.tokens].every((t) => set.has(t))) {
        // The list's name is longer than the letterhead ("... (Robert Komocsi)").
        score = Math.max(score, c.tokens.size)
      }
    }
    if (score > 0) scored.push({ rec, score })
  }
  if (scored.length === 0) return null
  const best = Math.max(...scored.map((s) => s.score))
  const top = scored.filter((s) => s.score === best)
  return top.length === 1 ? top[0].rec : null
}

// `records` are { id, name } rows (entities, vendors) read as-is from the app.
export function matchEntity(pages, entities) {
  return matchByName(entities, pageCells(pages, 2))
}

export function matchVendor(pages, vendors) {
  return matchByName(vendors, pageCells(pages, 1), { minTokens: 1, reverse: true })
}

// Sites only make sense inside the matched entity.
export function matchSubProject(pages, subProjects) {
  return matchByName(subProjects, pageCells(pages, 1))
}

// The name printed at the top of the document, for telling the person what
// was read when it doesn't match anything in the vendor list. A company name
// is a few words of text, not an address, a phone number or the document's
// own title.
const TITLE_WORDS = /^(?:commercial\s+)?(?:tax\s+)?(?:invoice|estimate|quote|quotation|statement|proposal|purchase\s+order|order\s+confirmation|packing\s+slip)\b/i
export function guessLetterhead(pages) {
  const page = pages[0]
  if (!page) return null
  for (const row of buildRows(page.items)) {
    if (row.y > (page.height || 792) * 0.18) break
    for (const c of row.cells) {
      const t = c.text.trim()
      if (t.length < 4 || /^\d/.test(t) || TITLE_WORDS.test(t) || /@|www\.|\bphone\b|\btel\b/i.test(t)) continue
      if (t.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length >= 2) return t
    }
  }
  return null
}

// Existing records whose name looks like `name` -- one's words contain the
// other's ("RK Solar" / "RK Solar & Automation Services Inc."), or they're the
// same words in another form ("Hwy 2S" / "Highway 2 South"). Used to warn
// before a near-duplicate vendor gets requested.
export function similarNames(name, records) {
  const mine = nameTokens(name)
  if (mine.length === 0) return []
  const set = new Set(mine)
  return records.filter((rec) => {
    const theirs = nameTokens(rec.name)
    if (theirs.length === 0) return false
    const theirSet = new Set(theirs)
    return mine.every((t) => theirSet.has(t)) || theirs.every((t) => set.has(t))
  })
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
