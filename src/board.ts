// The home board (BL-9): Later → Next → Now → Built across all repos. Only a new view of the existing sections:
// Later = every IDEAS.md plus UNASSIGNED_IDEAS.md, Next = "## Held", Now = "## Ready", Built = BUILT.md's last 7 days.
// Blocked is a badge, never a column. Within a column items are grouped by project in the card sort order (Unassigned
// first, as on the Ideas page), each file's order kept. Pure functions; the page is in App.tsx.
import type { BuiltItem, Data, Estimate, Idea, PlannedItem, Project } from './types';
import { sortProjects, type SortKey } from './sort';
import { ideaMarkdown, itemMarkdown } from '../lib/lists.mjs';

export type Column = 'later' | 'next' | 'now' | 'built';
export const COLUMNS: { key: Column; label: string }[] = [
  { key: 'later', label: 'Later' },
  { key: 'next', label: 'Next' },
  { key: 'now', label: 'Now' },
  { key: 'built', label: 'Built' },
];
export const BUILT_DAYS = 7;
export const UNASSIGNED = 'unassigned';

export interface BoardItem {
  key: string;
  column: Column;
  /** The project tag: the repo, or "unassigned" for UNASSIGNED_IDEAS.md. */
  repo: string;
  id: string | null;
  title: string;
  /** What opens in place: the full spec, or the built item's sentence; empty for one-line ideas. */
  body: string;
  blocked: boolean;
  date: string | null;
  estimate: Estimate | null;
  took: Estimate | null;
  markdown: string;
}

/** YYYY-MM-DD in the viewer's own time zone. */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The first day still in Built: today and the 6 days before it (7 days in all). */
export function builtCutoff(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (BUILT_DAYS - 1));
  return localDay(d);
}

const planned = (repo: string, column: Column, i: PlannedItem, n: number): BoardItem => ({
  key: `${repo}:${column}:${n}`,
  column,
  repo,
  id: i.id,
  title: i.title,
  body: i.body,
  blocked: i.blocked,
  date: null,
  estimate: i.estimate,
  took: null,
  markdown: itemMarkdown(i),
});
const idea = (repo: string, i: Idea, n: number): BoardItem => ({
  key: `${repo}:later:${n}`,
  column: 'later',
  repo,
  id: i.id,
  title: i.title,
  body: '',
  blocked: false,
  date: null,
  estimate: null,
  took: null,
  markdown: ideaMarkdown(i),
});
const built = (repo: string, date: string, i: BuiltItem, n: number): BoardItem => ({
  key: `${repo}:built:${date}:${n}`,
  column: 'built',
  repo,
  id: i.id,
  title: i.title,
  body: i.detail,
  blocked: false,
  date,
  estimate: null,
  took: i.took,
  markdown: i.markdown,
});

/**
 * Every board item, in board order. `cutoff` (YYYY-MM-DD) drops Built days before it; null keeps every day (search
 * looks through the whole built list).
 */
export function boardItems(data: Data, sort: SortKey, cutoff: string | null): BoardItem[] {
  const projects: Project[] = sortProjects(data.projects, sort);
  const out: BoardItem[] = [];
  data.unassigned.ideas.forEach((i, n) => out.push(idea(UNASSIGNED, i, n)));
  for (const p of projects) {
    p.ideas.forEach((i, n) => out.push(idea(p.repo, i, n)));
    let n = 0;
    for (const s of p.planned) {
      if (s.kind === 'other') continue;
      const column: Column = s.kind === 'held' ? 'next' : 'now';
      for (const i of s.items) out.push(planned(p.repo, column, i, n++));
    }
  }
  // Built: newest day first; within a day, projects in card order, each file's order kept.
  const days = new Set<string>();
  for (const p of projects) for (const d of p.built) if (!cutoff || d.date >= cutoff) days.add(d.date);
  for (const date of [...days].sort().reverse())
    for (const p of projects) p.built.find((d) => d.date === date)?.items.forEach((i, n) => out.push(built(p.repo, date, i, n)));
  return out;
}

const ID_QUERY = /^[A-Z]{1,4}-\d+[a-z]?$/i;

/** Same rule as the old search (search.ts): an ID matches only that ID; text needs every word in ID, title or body. */
export function matches(item: BoardItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (ID_QUERY.test(q)) return item.id?.toLowerCase() === q.toLowerCase();
  const hay = `${item.id ?? ''} ${item.title} ${item.body}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

/** An empty selection means All. Names not among the projects (a repo since renamed) are ignored. */
export function inFilter(item: BoardItem, selected: string[]): boolean {
  return !selected.length || selected.includes(item.repo);
}

export interface Summary {
  now: number;
  next: number;
  later: number;
  blocked: number;
  built: number;
}

/** The board header's counts; a blocked item counts once (it stays in its own column). */
export function summarize(items: BoardItem[]): Summary {
  const of = (c: Column) => items.filter((i) => i.column === c).length;
  return { now: of('now'), next: of('next'), later: of('later'), blocked: items.filter((i) => i.blocked).length, built: of('built') };
}

export const summaryLine = (s: Summary, builtLabel = `Built (${BUILT_DAYS} days)`) =>
  `Now ${s.now} · Next ${s.next} · Later ${s.later} · Blocked ${s.blocked} · ${builtLabel} ${s.built}`;

export const FILTER_STORAGE_KEY = 'backlogkit.board.projects';

export function loadFilter(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveFilter(selected: string[]) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selected));
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}
