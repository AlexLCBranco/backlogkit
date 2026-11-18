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
      item = { ...splitId(text), text, detail: '', markdown: line.trimEnd(), version: text.match(VERSION)?.[1] ?? null }
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
