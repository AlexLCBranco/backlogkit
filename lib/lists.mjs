// The one parser for the owner's three lists (FEATURE_BACKLOG.md, BUILT.md, IDEAS.md; format: CLAUDE.md, "Feature
// backlog, built list and ideas"). Used by the site's function (api/projects.ts) and by the all-repos generator (BL-2),
// so both read the files the same way. Plain JS so Node runs it as is; types in lists.d.mts.

const ID = /^([A-Z]{1,4}-\d+[a-z]?)\s+[—–-]\s+/
const VERSION = /\bv(\d+\.\d+\.\d+)\b/
const BLOCKED = /^\s*(?:[-*]\s+)?(?:\*\*)?Blocked:/im

const lines = (text) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n')

/** Splits "BL-3 — Title" into its ID and title; no ID → id null. */
export function splitId(text) {
  const m = text.match(ID)
  return m ? { id: m[1], title: text.slice(m[0].length).trim() } : { id: null, title: text.trim() }
}

/**
 * FEATURE_BACKLOG.md → its "## " sections in file order, each with its "### " items (ID, title, full text below the
 * heading, blocked when a line starts with "Blocked:"). Text before the first section is left out (it's the preamble).
 */
export function parseBacklog(text) {
  const sections = []
  let section = null
  let item = null
  const close = () => {
    if (item) {
      item.body = item.body.join('\n').trim()
      item.blocked = BLOCKED.test(item.body)
      item.estimate = parseEstimate(item.body)
      item.short = parseShort(item.body)
      item = null
    }
  }
  for (const line of lines(text)) {
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2 && !line.startsWith('###')) {
      close()
      section = { name: h2[1], kind: sectionKind(h2[1]), items: [] }
      sections.push(section)
      continue
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3 && section) {
      close()
      item = { ...splitId(h3[1]), heading: h3[1], body: [], blocked: false }
      section.items.push(item)
      continue
    }
    if (item) item.body.push(line)
  }
  close()
  return sections
}

/**
 * The "**In short:** <sentence>" line (BL-15; format: CLAUDE.md, "backlogkit formats"), only when it is the first
 * non-empty line under the heading. Missing or elsewhere → null.
 */
export function parseShort(body) {
  const first = lines(body).find((l) => l.trim())
  const m = first?.match(/^\s*\*\*In short:\*\*\s*(.*?)\s*$/i)
  return m && m[1] ? m[1] : null
}

/** "Ready", "Held (needs the owner's go ...)" → ready / held; anything else → other. */
export function sectionKind(name) {
  if (/^ready\b/i.test(name)) return 'ready'
  if (/^held\b/i.test(name)) return 'held'
  return 'other'
}

/**
 * BUILT.md → days newest first, each with its items in file order. "### Internal" subsections are left out (as in
 * ALL_BUILT.md). An item is a "- " line; indented lines below it are its detail.
 */
export function parseBuiltDays(text) {
  const byDate = new Map()
  let date = null
  let internal = false
  let item = null
  for (const line of lines(text)) {
    const day = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/)
    if (day && !line.startsWith('###')) {
      date = day[1]
      internal = false
      item = null
      if (!byDate.has(date)) byDate.set(date, [])
      continue
    }
    if (/^###\s/.test(line)) {
      internal = /^###\s+Internal\b/i.test(line)
      item = null
      continue
    }
    if (!date || internal) continue
    if (line.startsWith('- ')) {
      const text = line.slice(2).trim()
      const took = parseTook(text)
      const head = splitId(text)
      item = { ...head, title: took ? head.title.replace(TOOK, '').trim() : head.title, text, detail: '', markdown: line.trimEnd(), version: text.match(VERSION)?.[1] ?? null, took }
      byDate.get(date).push(item)
    } else if (/^\s+\S/.test(line) && item) {
      item.detail = item.detail ? `${item.detail} ${line.trim()}` : line.trim()
      item.markdown += `\n${line.trimEnd()}`
    } else if (!line.trim()) {
      item = null
    }
  }
  return [...byDate.entries()]
    .filter(([, items]) => items.length)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, items }))
}

/** gauntlet's old shape ({ date: ["item text + detail", ...] }), kept for the all-repos generator. */
export function parseBuilt(text) {
  const out = {}
  for (const { date, items } of parseBuiltDays(text)) out[date] = items.map((i) => (i.detail ? `${i.text} ${i.detail}` : i.text))
  return out
}

/** IDEAS.md → its "- " items (indented lines continue the one above). */
export function parseIdeas(text) {
  const ideas = []
  let idea = null
  for (const line of lines(text)) {
    if (line.startsWith('- ')) {
      idea = { ...splitId(line.slice(2).trim()) }
      ideas.push(idea)
    } else if (/^\s+\S/.test(line) && idea) {
      idea.title = `${idea.title} ${line.trim()}`
    } else {
      idea = null
    }
  }
  return ideas
}

// Time estimates and measured times (BL-8). Durations are minutes: "~12 min", "~10–20 min", "0.5 min".
const DURATION = /^~?\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*~?\s*(\d+(?:\.\d+)?))?\s*min(?:utes?)?$/i
const ESTIMATE = /^\s*(?:[-*]\s+)?\*\*Estimate:\*\*\s*(.*?)\s*$/im
const TOOK = /\s*\(took\s+([^)]*)\)/i
const SUITE_RECORD = /^Suite time:\s*(.*?)\s*$/im

/** "~10–20 min" → { min: 10, max: 20 }; "~5 min" → { min: 5, max: 5 }; anything else → null. */
export function parseDuration(text) {
  const m = String(text ?? '').trim().match(DURATION)
  if (!m) return null
  const min = Number(m[1])
  const max = m[2] === undefined ? min : Number(m[2])
  return max < min ? null : { min, max }
}

/** "build ~N min · suite ~M min" (also "," or ";" between) → { build, suite }, each a duration or null. */
function namedDurations(text, names) {
  const out = Object.fromEntries(names.map((n) => [n, null]))
  for (const part of String(text).split(/\s*[·,;]\s*/)) {
    const m = part.match(/^(\w+)\s+(.+)$/)
    if (m && names.includes(m[1].toLowerCase())) out[m[1].toLowerCase()] = parseDuration(m[2])
  }
  return out
}

/**
 * A planned item's "**Estimate:** build ~N min · suite ~M min" line → { raw, build, suite, ok }; no line → null. A line
 * that can't be read keeps its raw text with ok false (shown as unreadable, left out of totals).
 */
export function parseEstimate(body) {
  const m = String(body ?? '').match(ESTIMATE)
  if (!m) return null
  const { build, suite } = namedDurations(m[1], ['build', 'suite'])
  return { raw: m[1], build, suite, ok: !!build && !!suite }
}

/** A built line's measured "(took N min, suite M min)" → { raw, build, suite, ok }; none → null. */
export function parseTook(text) {
  const m = String(text ?? '').match(TOOK)
  if (!m) return null
  const [first = '', ...rest] = m[1].split(/\s*[·,;]\s*/)
  const build = parseDuration(first)
  const { suite } = namedDurations(rest.join(' · '), ['suite'])
  return { raw: m[1], build, suite, ok: !!build }
}

/**
 * BUILT.md header's measured suite times: "Suite time: last ~N min (YYYY-MM-DD) · longest ~M min (YYYY-MM-DD)" →
 * { raw, last, longest } with each { minutes, date } or null; no line (before the first day) → null.
 */
export function parseSuiteRecord(text) {
  const header = String(text ?? '').replace(/\r\n?/g, '\n').split(/^## /m)[0]
  const m = header.match(SUITE_RECORD)
  if (!m) return null
  const one = (name) => {
    const x = m[1].match(new RegExp(`\\b${name}\\s+(~?\\s*\\d+(?:\\.\\d+)?\\s*min(?:utes?)?)(?:\\s*\\((\\d{4}-\\d{2}-\\d{2})\\))?`, 'i'))
    const d = x && parseDuration(x[1])
    return d ? { minutes: d.min, date: x[2] ?? null } : null
  }
  return { raw: m[1], last: one('last'), longest: one('longest') }
}

/** Adds up the readable estimates of planned items: { build, suite, estimated, total } (build/suite null when none). */
export function estimateTotal(items) {
  const ok = items.filter((i) => i.estimate?.ok)
  const sum = (k) => (ok.length ? ok.reduce((a, i) => ({ min: a.min + i.estimate[k].min, max: a.max + i.estimate[k].max }), { min: 0, max: 0 }) : null)
  return { build: sum('build'), suite: sum('suite'), estimated: ok.length, total: items.length }
}

/** { min: 10, max: 20 } → "~10–20 min"; equal ends → "~10 min". */
export function formatDuration(d) {
  if (!d) return null
  const n = (x) => String(Math.round(x * 10) / 10)
  return d.min === d.max ? `~${n(d.min)} min` : `~${n(d.min)}–${n(d.max)} min`
}

/** UNASSIGNED_IDEAS.md (this repo; BL-7): ideas that belong to no repo yet, same "- U-n — idea (date)" lines as IDEAS.md.
 *  A missing file (null) has none. */
export function parseUnassignedIdeas(text) {
  return text === null || text === undefined ? [] : parseIdeas(text)
}

/** One idea as its Markdown line, as in IDEAS.md. */
export function ideaMarkdown(idea) {
  return `- ${idea.id ? `${idea.id} — ` : ''}${idea.title}`
}

/**
 * Newest version named in BUILT.md ("v1.2.3" anywhere in an item), and the date of the newest built item. A BUILT.md
 * that says "No version numbers here" (gauntlet) has none: its older lines name other repos' versions.
 */
export function builtSummary(days, text = '') {
  let latestVersion = null
  if (/No version numbers here/i.test(text)) return { latestVersion, latestBuiltDate: days[0]?.date ?? null }
  for (const { items } of days) {
    for (const i of items) if (!latestVersion && i.version) latestVersion = i.version
    if (latestVersion) break
  }
  return { latestVersion, latestBuiltDate: days[0]?.date ?? null }
}

/** Counts for a card: planned (Ready / Held), blocked, ideas. */
export function counts(sections, ideas) {
  const all = sections.flatMap((s) => s.items)
  const of = (kind) => sections.filter((s) => s.kind === kind).reduce((n, s) => n + s.items.length, 0)
  return { ready: of('ready'), held: of('held'), planned: all.length, blocked: all.filter((i) => i.blocked).length, ideas: ideas.length }
}

/** One planned item as Markdown: its heading line and full spec text, as in the repo's FEATURE_BACKLOG.md. */
export function itemMarkdown(item, level = 3) {
  const heading = item.heading ?? (item.id ? `${item.id} — ${item.title}` : item.title)
  return `${'#'.repeat(level)} ${heading}${item.body ? `\n${item.body}` : ''}`
}

/** The whole planned list (its Ready and Held sections, with their "## " headings) as Markdown. */
export function backlogMarkdown(sections) {
  const out = []
  for (const s of sections.filter((x) => x.kind !== 'other' && x.items.length)) {
    out.push(`## ${s.name}`, '')
    for (const i of s.items) out.push(itemMarkdown(i), '')
  }
  return out.length ? out.join('\n').trimEnd() + '\n' : ''
}
