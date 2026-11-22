// The home page (BL-9, BL-12, redesigned as five lanes in BL-14), always in this order:
//   Stuck – needs you    every planned item with a Blocked: line, from "## Ready" or "## Held"
//   Will be built next   "## Ready" items that are not blocked
//   Waiting for your OK  "## Held" items that are not blocked
//   Ideas                every repo's IDEAS.md plus UNASSIGNED_IDEAS.md
//   Done                 BUILT.md's last 7 days
// An item is in exactly one lane. Within a lane items are grouped by project in the card sort order, each file's order
// kept. The files keep their Ready / Held sections; only the screen uses the lane names. Pure functions; the page is
// in App.tsx.
import type { BlockedNote, BuiltItem, Data, Estimate, Idea, PlannedItem, Project, Section, Why } from './types';
import { sortProjects, type SortKey } from './sort';
import { itemMarkdown } from '../lib/lists.mjs';
import { codeIndex, unblockFirst, waitsFor, type CodeIndex, type Waits } from './waits';

export type Lane = 'stuck' | 'next' | 'waiting' | 'ideas' | 'done';
export const LANES: { key: Lane; label: string; empty: string }[] = [
  { key: 'stuck', label: 'Stuck – needs you', empty: 'Nothing stuck.' },
  { key: 'next', label: 'Will be built next', empty: 'Nothing to build next.' },
  { key: 'waiting', label: 'Waiting for your OK', empty: 'Nothing waiting for your OK.' },
  { key: 'ideas', label: 'Ideas', empty: 'No ideas.' },
  { key: 'done', label: 'Done', empty: 'Nothing built matches.' }, // shown only while searching (BL-18)
];
/** Idea groups by why they're not planned (BL-17), in page order; "Maybe never" last and folded. */
export type WhyKey = Why | 'none';
export const WHY_GROUPS: { key: WhyKey; label: string; folded?: boolean }[] = [
  { key: 'decision', label: 'Needs your decision' },
  { key: 'waiting', label: 'Waiting on something' },
  { key: 'too-big', label: 'Too big, needs splitting' },
  { key: 'later', label: 'Not important yet' },
  { key: 'none', label: 'No reason yet' },
  { key: 'never', label: 'Maybe never', folded: true },
];
export const isWhyKey = (s: string | undefined): s is WhyKey => WHY_GROUPS.some((g) => g.key === s);

/** Every group, in order, with its ideas (the input order kept within a group). */
export function ideaGroups(ideas: BoardIdea[]) {
  return WHY_GROUPS.map((g) => ({ ...g, ideas: ideas.filter((i) => (i.idea.why ?? 'none') === g.key) }));
}

export const laneLabel = (k: Lane) => LANES.find((l) => l.key === k)!.label;
export const BUILT_DAYS = 7;

/** A planned or built item on the home page (ideas are BoardIdea). */
export interface BoardItem {
  key: string;
  lane: Exclude<Lane, 'ideas'>;
  /** The file section a planned item is in (Stuck holds both); null for built items. */
  section: 'ready' | 'held' | null;
  repo: string;
  id: string | null;
  title: string;
  /** A built item's version ("1.3.0"), null otherwise. */
  version: string | null;
  /** The spec's "In short" sentence (BL-15); null when it has none, and for built items. */
  short: string | null;
  /** The Blocked note: the question for the owner (BL-16); null when not blocked. */
  blockedNote: BlockedNote | null;
  /** What a stuck item waits for (BL-21): the item IDs its Blocked note names, looked up in every repo; null when none. */
  waits: Waits | null;
  /** What opens in place: the full spec, or the built item's sentence. */
  body: string;
  blocked: boolean;
  date: string | null;
  estimate: Estimate | null;
  took: Estimate | null;
  markdown: string;
}

/** An idea; repo null = UNASSIGNED_IDEAS.md. */
export interface BoardIdea {
  key: string;
  repo: string | null;
  idea: Idea;
}

/** YYYY-MM-DD in the viewer's own time zone. */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The first day still in Done: today and the 6 days before it (7 days in all). */
export function builtCutoff(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (BUILT_DAYS - 1));
  return localDay(d);
}

/** Which lane a planned item belongs in: blocked → Stuck wherever it is; else Ready → next, Held → waiting. */
export function laneOf(section: 'ready' | 'held', blocked: boolean): 'stuck' | 'next' | 'waiting' {
  if (blocked) return 'stuck';
  return section === 'ready' ? 'next' : 'waiting';
}

const planned = (repo: string, section: 'ready' | 'held', i: PlannedItem, n: number, index: CodeIndex): BoardItem => ({
  key: `${repo}:plan:${n}`,
  lane: laneOf(section, i.blocked),
  section,
  repo,
  id: i.id,
  title: i.title,
  version: null,
  short: i.short ?? null,
  blockedNote: i.blockedNote ?? null,
  waits: i.blocked ? waitsFor(i.blockedNote?.text, i.id, repo, index) : null,
  body: i.body,
  blocked: i.blocked,
  date: null,
  estimate: i.estimate,
  took: null,
  markdown: itemMarkdown(i),
});
const built = (repo: string, date: string, i: BuiltItem, n: number): BoardItem => ({
  key: `${repo}:built:${date}:${n}`,
  lane: 'done',
  section: null,
  repo,
  id: i.id,
  title: i.title,
  version: i.version ?? null,
  short: null,
  blockedNote: null,
  waits: null,
  body: i.detail,
  blocked: false,
  date,
  estimate: null,
  took: i.took,
  markdown: i.markdown,
});

/** A project's planned sections that count (Ready and Held; "other" sections are left out). */
const plannedSections = (p: Project) => p.planned.filter((s): s is Section & { kind: 'ready' | 'held' } => s.kind !== 'other');

/**
 * Every planned and built item, in page order. `cutoff` (YYYY-MM-DD) drops built days before it; null keeps every day
 * (search looks through the whole built list).
 */
export function boardItems(data: Data, sort: SortKey, cutoff: string | null): BoardItem[] {
  const projects: Project[] = sortProjects(data.projects, sort);
  const index = codeIndex(data);
  const plan: BoardItem[] = [];
  for (const p of projects) {
    let n = 0;
    for (const s of plannedSections(p)) for (const i of s.items) plan.push(planned(p.repo, s.kind, i, n++, index));
  }
  const out = unblockFirst(plan); // BL-21: stuck items that can be unblocked come first in Stuck
  // Done: newest day first; within a day, projects in card order, each file's order kept.
  const days = new Set<string>();
  for (const p of projects) for (const d of p.built) if (!cutoff || d.date >= cutoff) days.add(d.date);
  for (const date of [...days].sort().reverse())
    for (const p of projects) p.built.find((d) => d.date === date)?.items.forEach((i, n) => out.push(built(p.repo, date, i, n)));
  return out;
}

/** Every idea: unassigned first, then each repo's in card order. */
export function boardIdeas(data: Data, sort: SortKey): BoardIdea[] {
  const out: BoardIdea[] = data.unassigned.ideas.map((idea, n) => ({ key: `unassigned:${n}`, repo: null, idea }));
  for (const p of sortProjects(data.projects, sort)) p.ideas.forEach((idea, n) => out.push({ key: `${p.repo}:idea:${n}`, repo: p.repo, idea }));
  return out;
}

/** Per-lane counts for a set of items and ideas (the number strip, and a project card). */
export function laneCounts(items: BoardItem[], ideas: BoardIdea[]): Record<Lane, number> {
  const c: Record<Lane, number> = { stuck: 0, next: 0, waiting: 0, ideas: ideas.length, done: 0 };
  for (const i of items) c[i.lane]++;
  return c;
}

/** How many stuck items can be unblocked (BL-21): shown wherever the Stuck number is. */
export const unblockCount = (items: BoardItem[]) => items.filter((i) => i.lane === 'stuck' && i.waits?.ready).length;
export const unblockText = (n: number) => `${n} can be unblocked`;

/** One project's stuck items that can be unblocked (its card on the Projects page). */
export function projectUnblockCount(p: Project, index: CodeIndex): number {
  let n = 0;
  for (const s of plannedSections(p)) for (const i of s.items) if (i.blocked && waitsFor(i.blockedNote?.text, i.id, p.repo, index)?.ready) n++;
  return n;
}

/** One project's planned lanes and ideas (its card on the Projects page). */
export function projectLaneCounts(p: Project): Record<Exclude<Lane, 'done'>, number> {
  const c = { stuck: 0, next: 0, waiting: 0, ideas: p.ideas.length };
  for (const s of plannedSections(p)) for (const i of s.items) c[laneOf(s.kind, i.blocked)]++;
  return c;
}

const ID_QUERY = /^[A-Z]{1,4}-\d+[a-z]?$/i;

/** An ID matches only that ID; text needs every word in the ID, title or body. */
export function matchesText(id: string | null, hay: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (ID_QUERY.test(q)) return id?.toLowerCase() === q.toLowerCase();
  const all = `${id ?? ''} ${hay}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => all.includes(w));
}
export const matches = (item: BoardItem, query: string) => matchesText(item.id, `${item.title} ${item.body}`, query);
export const ideaMatches = (i: BoardIdea, query: string) => matchesText(i.idea.id, i.idea.title, query);

/** Where a project's ideas can be planned into (it has a FEATURE_BACKLOG.md). */
export const planTargets = (data: Data) => data.projects.filter((p) => p.files.backlog).map((p) => p.repo).sort((a, b) => a.localeCompare(b));

/** An empty selection means All projects. Unassigned ideas (no repo) show only then. */
export function inFilter(item: { repo: string | null }, selected: string[]): boolean {
  return !selected.length || (item.repo !== null && selected.includes(item.repo));
}

/** Done grouped by repo (BL-12): each repo once, the repo with most items first (ties by name), newest first within a repo. */
export function builtGroups(items: BoardItem[]): { repo: string; items: BoardItem[] }[] {
  const by = new Map<string, BoardItem[]>();
  for (const i of items) if (i.lane === 'done') by.set(i.repo, [...(by.get(i.repo) ?? []), i]);
  return [...by].map(([repo, list]) => ({ repo, items: list })).sort((a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo));
}

// Done: what's new since your last visit (BL-18). "Seen" is a list of built-item keys kept in this browser; only
// "Mark all seen" adds to it (never a reload). A built item is new when it is from the last 30 days and not seen; on
// the first visit (no list yet) everything from the last 7 days is new.
export const NEW_DAYS = 30;
export const SEEN_STORAGE_KEY = 'backlogkit.done.seen';

/** The first day still in the 30 days a built item can be new in. */
export const newCutoff = (now: Date) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (NEW_DAYS - 1)));

/** A built item's key: repo + ID, or repo + title + version for items without an ID. */
export const doneKey = (i: Pick<BoardItem, 'repo' | 'id' | 'title' | 'version'>) => (i.id ? `${i.repo}#${i.id}` : `${i.repo}#${i.title}#${i.version ?? ''}`);

/** Which built items are new: `seen` null = first visit. Input order kept. */
export function newDone(items: BoardItem[], seen: string[] | null, now: Date): BoardItem[] {
  const built = items.filter((i) => i.lane === 'done');
  if (seen === null) return built.filter((i) => i.date! >= builtCutoff(now));
  const s = new Set(seen);
  return built.filter((i) => i.date! >= newCutoff(now) && !s.has(doneKey(i)));
}

/**
 * The seen list after "Mark all seen" on `shown`: what was seen (first visit: everything older than 7 days, which
 * never counted as new) plus `shown`, kept to keys still within the 30 days.
 */
export function markSeen(items: BoardItem[], seen: string[] | null, shown: BoardItem[], now: Date): string[] {
  const recent = items.filter((i) => i.lane === 'done' && i.date! >= newCutoff(now));
  const base = seen ?? recent.filter((i) => i.date! < builtCutoff(now)).map(doneKey);
  const keep = new Set(recent.map(doneKey));
  return [...new Set([...base, ...shown.map(doneKey)])].filter((k) => keep.has(k));
}

export function loadSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function saveSeen(seen: string[]) {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // storage blocked: seen until the page is reloaded
  }
}
// (BL-19: the chosen projects live in the address now, not in this browser's storage.)
