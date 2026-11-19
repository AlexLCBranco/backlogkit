// The home board (BL-9, redesigned in BL-12): stacked full-width sections Now → Next → Built across all repos.
// Now = "## Ready", Next = "## Held", Built = BUILT.md's last 7 days. Planned and built work only: ideas live on the
// Ideas page, never here. Blocked is a badge, never a section. Within Now and Next items are grouped by project in the
// card sort order, each file's order kept; Built is grouped by repo (builtGroups). Pure functions; the page is in App.tsx.
import type { BuiltItem, Data, Estimate, PlannedItem, Project } from './types';
import { sortProjects, type SortKey } from './sort';
import { itemMarkdown } from '../lib/lists.mjs';

export type Column = 'now' | 'next' | 'built';
export const COLUMNS: { key: Column; label: string }[] = [
  { key: 'now', label: 'Now' },
  { key: 'next', label: 'Next' },
  { key: 'built', label: 'Built' },
];
export const BUILT_DAYS = 7;

export interface BoardItem {
  key: string;
  column: Column;
  repo: string;
  id: string | null;
  title: string;
  /** What opens in place: the full spec, or the built item's sentence. */
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
  for (const p of projects) {
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

/**
 * Built grouped by repo (BL-12): each repo once, the repo with most items first (ties by name), newest first within
 * a repo (the input is already newest first, so each repo's order is kept).
 */
export function builtGroups(items: BoardItem[]): { repo: string; items: BoardItem[] }[] {
  const by = new Map<string, BoardItem[]>();
  for (const i of items) if (i.column === 'built') by.set(i.repo, [...(by.get(i.repo) ?? []), i]);
  return [...by].map(([repo, list]) => ({ repo, items: list })).sort((a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo));
}

/** "footykit 14 · backlogkit 11": Built's collapsed line. */
export const builtCounts = (groups: { repo: string; items: unknown[] }[]) => groups.map((g) => `${g.repo} ${g.items.length}`).join(' · ');

/** One stable colour per repo (BL-12): a hue from the repo name, so it never changes when repos are added or sorted. */
export function repoColor(repo: string): string {
  let h = 0;
  for (const ch of repo.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 65% 62%)`;
}

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
