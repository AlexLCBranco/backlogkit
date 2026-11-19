// One-click moves (BL-11), as pure text edits of the owner's list files (format: CLAUDE.md, "Feature backlog, built
// list and ideas"). The function api/move.ts reads the files from GitHub, calls these, and commits the result.
//   ideaToHeld: cut an idea from IDEAS.md / UNASSIGNED_IDEAS.md, add it at the bottom of "## Held" with the repo's next
//               free ID and a "From I-n" line.
//   heldToReady: move a "## Held" item to the bottom of "## Ready".
// Never anything into Built. Every refusal throws a MoveError with a plain reason (nothing is written then).

import { blockedSpan } from './lists.mjs'

export class MoveError extends Error {}

const lines = (text) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const ID_RE = /^[A-Z]{1,4}-\d+[a-z]?$/
const IDEA_PREFIXES = new Set(['I', 'U'])

/** The repo's item ID prefix ("BL"): the one its backlog headings and built lines use most. None found → null. */
export function idPrefix(backlog, built) {
  const n = new Map()
  const add = (p) => !IDEA_PREFIXES.has(p) && n.set(p, (n.get(p) ?? 0) + 1)
  for (const l of lines(backlog)) {
    const m = l.match(/^###\s+([A-Z]{1,4})-\d+[a-z]?\s+[—–-]\s/)
    if (m) add(m[1])
  }
  for (const l of lines(built)) {
    const m = l.match(/^-\s+([A-Z]{1,4})-\d+[a-z]?\s+[—–-]\s/)
    if (m) add(m[1])
  }
  let best = null
  for (const [p, c] of n) if (!best || c > n.get(best)) best = p
  return best
}

/** Next free ID: one more than the highest "<prefix>-n" anywhere in the backlog or built list (IDs are never reused). */
export function nextId(prefix, ...texts) {
  let max = 0
  const re = new RegExp(`\\b${esc(prefix)}-(\\d+)`, 'g')
  for (const t of texts) for (const m of String(t ?? '').matchAll(re)) max = Math.max(max, Number(m[1]))
  return `${prefix}-${max + 1}`
}

/** "## " sections as line ranges: { name, start (heading line), end (exclusive) }. */
function sections(ls) {
  const out = []
  ls.forEach((l, i) => {
    if (/^##\s/.test(l) && !l.startsWith('###')) {
      if (out.length) out[out.length - 1].end = i
      out.push({ name: l.replace(/^##\s+/, '').trim(), start: i, end: ls.length })
    }
  })
  return out
}
const findSection = (ls, word) => sections(ls).find((s) => new RegExp(`^${word}\\b`, 'i').test(s.name)) ?? null

/** Inserts `block` (lines) at the bottom of a section: after its last non-blank line, one blank line before and after. */
function appendToSection(ls, sec, block) {
  let at = sec.end
  while (at > sec.start + 1 && !ls[at - 1].trim()) at--
  const after = sec.end < ls.length ? [''] : []
  const out = [...ls.slice(0, at), '', ...block, ...after, ...ls.slice(sec.end)]
  return out
}
/** Lines back to text, in the file's own line endings, ending in exactly one newline. */
const join = (ls, like) => {
  const nl = /\r\n/.test(String(like ?? '')) ? '\r\n' : '\n'
  return ls.join('\n').replace(/\n*$/, '\n').replace(/\n/g, nl)
}

/** The idea line ("- I-3 — text (date)") and its indented continuation lines: { start, end, text }. */
function findIdea(ls, id) {
  const head = new RegExp(`^-\\s+${esc(id)}\\s+[—–-]\\s+(.*)$`)
  const start = ls.findIndex((l) => head.test(l))
  if (start < 0) return null
  let end = start + 1
  while (end < ls.length && /^\s+\S/.test(ls[end])) end++
  const text = [ls[start].match(head)[1], ...ls.slice(start + 1, end).map((l) => l.trim())].join(' ').trim()
  return { start, end, text }
}

/** `ideasText` without idea `ideaId` (its line and continuation lines). → { ideas, text } (text: the idea's own words). */
export function cutIdea(ideasText, ideaId) {
  if (!ID_RE.test(ideaId)) throw new MoveError(`"${ideaId}" is not an idea ID`)
  const il = lines(ideasText)
  const idea = findIdea(il, ideaId)
  if (!idea) throw new MoveError(`${ideaId} is not in the ideas file (moved already?)`)
  return { ideas: join([...il.slice(0, idea.start), ...il.slice(idea.end)], ideasText), text: idea.text }
}

/**
 * Cut idea `ideaId` from `ideasText` and add it at the bottom of `backlog`'s "## Held" (made at the end when there is
 * none) as "### <next ID> — <idea>" with a "From I-n (date)" line. → { ideas, backlog, id, title }.
 */
export function ideaToHeld({ ideasText, ideaId, backlog, built }) {
  if (backlog === null || backlog === undefined) throw new MoveError('That repo has no FEATURE_BACKLOG.md')
  const { ideas, text } = cutIdea(ideasText, ideaId)
  const idea = { text: text.replace(/\s*\[why:[^\]]*\]\s*$/i, '') } // the reason it wasn't planned no longer applies
  const prefix = idPrefix(backlog, built)
  if (!prefix) throw new MoveError("That repo's FEATURE_BACKLOG.md and BUILT.md name no item IDs, so its ID prefix is unknown")
  const id = nextId(prefix, backlog, built)
  const date = idea.text.match(/\s*\((\d{4}-\d{2}-\d{2})\)\s*$/)
  const title = date ? idea.text.slice(0, date.index).trim() : idea.text
  const block = [`### ${id} — ${title}`, `From ${ideaId}${date ? ` (${date[1]})` : ''}`]

  let bl = lines(backlog)
  let held = findSection(bl, 'held')
  if (!held) {
    bl = [...bl.slice(0, bl.length - (bl.at(-1) === '' ? 1 : 0)), '', '## Held']
    held = findSection(bl, 'held')
  }
  bl = appendToSection(bl, held, block)
  return { ideas, backlog: join(bl, backlog), id, title }
}

/** Move item `id` from "## Held" to the bottom of "## Ready" (its heading and spec text unchanged). → { backlog, title }. */
export function heldToReady({ backlog, id }) {
  if (!ID_RE.test(id)) throw new MoveError(`"${id}" is not an item ID`)
  if (backlog === null || backlog === undefined) throw new MoveError('That repo has no FEATURE_BACKLOG.md')
  const bl = lines(backlog)
  const held = findSection(bl, 'held')
  const ready = findSection(bl, 'ready')
  if (!held) throw new MoveError('FEATURE_BACKLOG.md has no "## Held" section')
  if (!ready) throw new MoveError('FEATURE_BACKLOG.md has no "## Ready" section')
  const head = new RegExp(`^###\\s+${esc(id)}\\s+[—–-]\\s+(.*)$`)
  const start = bl.findIndex((l, i) => i > held.start && i < held.end && head.test(l))
  if (start < 0) throw new MoveError(`${id} is not under Held (moved already?)`)
  let end = start + 1
  while (end < held.end && !/^###?\s/.test(bl[end])) end++
  const block = bl.slice(start, end)
  while (block.length && !block.at(-1).trim()) block.pop()
  const title = bl[start].match(head)[1].trim()
  const without = [...bl.slice(0, start), ...bl.slice(end)]
  return { backlog: join(appendToSection(without, findSection(without, 'ready'), block), backlog), title }
}

/** The message the site shows when an item's Blocked note is gone (answered elsewhere, or never there). */
export const ALREADY_ANSWERED = 'Already answered — reload'

/**
 * BL-16: replace item `id`'s Blocked note with one line "**Answered (date):** <the note> → <answer>". The answer is
 * put on one line. → { backlog, question }. No such item, or no Blocked note → MoveError.
 */
export function answerBlocked({ backlog, id, answer, date }) {
  if (!ID_RE.test(id)) throw new MoveError(`"${id}" is not an item ID`)
  if (backlog === null || backlog === undefined) throw new MoveError('That repo has no FEATURE_BACKLOG.md')
  const text = String(answer ?? '').replace(/\s+/g, ' ').trim()
  if (!text) throw new MoveError('Type an answer first')
  const bl = lines(backlog)
  const head = new RegExp(`^###\\s+${esc(id)}\\s+[—–-]\\s+`)
  const start = bl.findIndex((l) => head.test(l))
  if (start < 0) throw new MoveError(`${id} is not in FEATURE_BACKLOG.md any more`)
  let end = start + 1
  while (end < bl.length && !/^###?\s/.test(bl[end])) end++
  const span = blockedSpan(bl, start + 1, end)
  if (!span) throw new MoveError(ALREADY_ANSWERED)
  const line = `**Answered (${date}):** ${span.text} → ${text}`
  const out = [...bl.slice(0, span.start), line, ...bl.slice(span.end)]
  return { backlog: join(out, backlog), question: span.text }
}

/** BL-17: the values the owner can pick for an idea's reason; "none" takes the tag off. */
export const REASONS = ['waiting', 'decision', 'too-big', 'later', 'never', 'none']

/**
 * Set idea `ideaId`'s reason tag: any "[why: …]" in its lines is removed and "[why: <why>]" added at the end of its
 * last line ("none": only removed). → { ideas, changed }.
 */
export function setWhy(ideasText, ideaId, why) {
  if (!ID_RE.test(ideaId)) throw new MoveError(`"${ideaId}" is not an idea ID`)
  if (!REASONS.includes(why)) throw new MoveError(`"${why}" is not a reason (${REASONS.join(', ')})`)
  if (ideasText === null || ideasText === undefined) throw new MoveError('No ideas file')
  const il = lines(ideasText)
  const idea = findIdea(il, ideaId)
  if (!idea) throw new MoveError(`${ideaId} is not in the ideas file (moved already?)`)
  const out = [...il]
  for (let i = idea.start; i < idea.end; i++) out[i] = out[i].replace(/\s*\[why:[^\]]*\]/gi, '').trimEnd()
  if (why !== 'none') out[idea.end - 1] = `${out[idea.end - 1]} [why: ${why}]`
  const ideas = join(out, ideasText)
  return { ideas, changed: ideas !== join(il, ideasText) }
}
