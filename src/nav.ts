// BL-19: the shared layout's state (NAV_PATTERN.md §3). Everything on screen comes from the address:
//   #/ (Home), #/projects, #/ideas[/<reason>], #/built, plus ?p=<repo>,<repo> (the What chips: which projects),
//   ?q=<search> and, on Projects, ?sort=<key> (the How switch).
// Old addresses still work: #/p/<repo> opens Home with that project, #/all opens Home.
import { LANES, WHY_GROUPS, boardIdeas, boardItems, isWhyKey, type WhyKey } from './board';
import { SORT_OPTIONS, loadSort, type SortKey } from './sort';
import type { Data } from './types';

export type Place = 'board' | 'projects' | 'ideas' | 'built';

export interface Nav {
  page: Place;
  /** Ideas only: the reason group scrolled to and opened. */
  group?: WhyKey;
  /** The projects chosen in the What chips (empty = all). Names as typed until resolved against the data. */
  p: string[];
  q: string;
  sort: SortKey;
}

/** The Where tabs: the site's real pages, in order (at most 5). */
export const WHERE: { place: Place; label: string; tip: string }[] = [
  { place: 'board', label: 'Home', tip: 'Home: every project’s lists in five lanes' },
  { place: 'projects', label: 'Projects', tip: 'Projects: one card per project' },
  { place: 'ideas', label: 'Ideas', tip: 'Ideas: every idea, grouped by why it isn’t planned' },
  { place: 'built', label: 'Built', tip: 'Built: everything built, by day' },
];
export const placeLabel = (p: Place) => WHERE.find((w) => w.place === p)!.label;
/** Pages whose What row is the project chips. */
export const hasProjects = (p: Place) => p !== 'projects';

const isSort = (s: string | null): s is SortKey => SORT_OPTIONS.some((o) => o.value === s);

export function parseHash(hash: string, rememberedSort: () => SortKey = loadSort): Nav {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const q = params.get('q') ?? '';
  const p = (params.get('p') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const s = params.get('sort');
  const sort = isSort(s) ? s : rememberedSort();
  const parts = path.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  if (parts[0] === 'p' && parts[1]) return { page: 'board', p: [parts[1]], q, sort }; // old project page
  if (parts[0] === 'projects') return { page: 'projects', p: [], q, sort };
  if (parts[0] === 'ideas') return { page: 'ideas', ...(isWhyKey(parts[1]) ? { group: parts[1] } : {}), p, q, sort };
  if (parts[0] === 'built') return { page: 'built', p, q, sort };
  return { page: 'board', p, q, sort }; // also the old #/all
}

/** The address for a state; parseHash(hrefOf(x)) gives x back. */
export function hrefOf(n: Nav): string {
  const path = n.page === 'board' ? '#/' : n.page === 'ideas' && n.group ? `#/ideas/${n.group}` : `#/${n.page}`;
  const query: string[] = [];
  if (hasProjects(n.page) && n.p.length) query.push(`p=${n.p.map(encodeURIComponent).join(',')}`);
  if (n.q) query.push(`q=${encodeURIComponent(n.q)}`);
  if (n.page === 'projects') query.push(`sort=${n.sort}`);
  return path + (query.length ? `?${query.join('&')}` : '');
}

/** Typed project names matched to the real ones (any spelling), unknown names dropped, each once, in chip order. */
export function resolveProjects(names: string[], repos: string[]): string[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  return repos.filter((r) => want.has(r.toLowerCase()));
}

/** A search shows Home (searching looks through every lane). */
export const shownPlace = (n: Nav): Place => (n.q.trim() ? 'board' : n.page);

/** The browser tab's title for what's open (BL-6). */
export function titleOf(n: Nav): string {
  if (n.q.trim()) return `backlogkit · search “${n.q.trim()}”`;
  return `backlogkit · ${placeLabel(n.page)}`;
}

/** Where a Where tab goes from here: the chosen projects come along; a search is left. */
export function whereTarget(n: Nav, place: Place): Nav {
  return { page: place, p: hasProjects(place) ? n.p : [], q: '', sort: n.sort };
}

export interface Crumb {
  label: string;
  /** Its siblings, to jump sideways; empty = nothing to jump to. */
  items: { label: string; to: Nav; on: boolean }[];
}

/** The breadcrumb: the place, then the chosen projects, the idea group, the search. */
export function crumbs(n: Nav, repos: string[]): Crumb[] {
  const place = shownPlace(n);
  const out: Crumb[] = [
    { label: placeLabel(place), items: WHERE.map((w) => ({ label: w.label, to: whereTarget(n, w.place), on: !n.q.trim() && w.place === place })) },
  ];
  if (hasProjects(place) && n.p.length) {
    const here = { ...n, page: place };
    out.push({
      label: n.p.length === 1 ? n.p[0]! : `${n.p.length} projects`,
      items: [{ label: 'All projects', to: { ...here, p: [] }, on: false }, ...repos.map((r) => ({ label: r, to: { ...here, p: [r] }, on: n.p.length === 1 && n.p[0] === r }))],
    });
  }
  if (place === 'ideas' && n.group) {
    out.push({ label: WHY_GROUPS.find((g) => g.key === n.group)!.label, items: WHY_GROUPS.map((g) => ({ label: g.label, to: { ...n, group: g.key }, on: g.key === n.group })) });
  }
  if (n.q.trim()) out.push({ label: `Search “${n.q.trim()}”`, items: [] });
  return out;
}

/** A history entry's name, for the ← → tooltips. */
export const navLabel = (n: Nav) => crumbs(n, []).map((c) => c.label).join(' › ');

// ---------- Go anywhere ----------

export interface Entry {
  label: string;
  kind: string;
  to: Nav;
}

/** Everything "Go anywhere" can jump to: the places, every project, the idea groups, every item and idea with an ID. */
export function searchEntries(n: Nav, data: Data | null, repos: string[]): Entry[] {
  const base: Nav = { page: 'board', p: [], q: '', sort: n.sort };
  const out: Entry[] = WHERE.map((w) => ({ label: w.label, kind: 'Page', to: whereTarget(n, w.place) }));
  for (const r of repos) out.push({ label: r, kind: 'Project', to: { ...base, p: [r] } });
  for (const g of WHY_GROUPS) out.push({ label: g.label, kind: 'Ideas', to: { ...base, page: 'ideas', group: g.key } });
  if (!data) return out;
  for (const i of boardItems(data, n.sort, null))
    if (i.id) out.push({ label: `${i.id} — ${i.short ?? i.title}`, kind: `${i.repo} · ${LANES.find((l) => l.key === i.lane)!.label}`, to: { ...base, q: i.id } });
  for (const i of boardIdeas(data, n.sort))
    if (i.idea.id) out.push({ label: `${i.idea.id} — ${i.idea.text}`, kind: `${i.repo ?? 'Unassigned'} · Idea`, to: { ...base, q: i.idea.id } });
  return out;
}

/**
 * The entries matching what was typed (every word somewhere in the label or kind), best first: a label starting with
 * it, then a word starting with it, then anywhere. Always ends with "Search everything for …".
 */
export function searchFind(entries: Entry[], typed: string, n: Nav, max = 40): Entry[] {
  const q = typed.trim().toLowerCase();
  if (!q) return entries.filter((e) => e.kind === 'Page' || e.kind === 'Project');
  const words = q.split(/\s+/);
  const score = (e: Entry) => {
    const label = e.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label)) return 1;
    return 2;
  };
  const found = entries
    .filter((e) => {
      const hay = `${e.label} ${e.kind}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .map((e, i) => ({ e, s: score(e), i }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.e);
  return [...found, { label: `Search everything for “${typed.trim()}”`, kind: 'Search', to: { page: 'board', p: hasProjects(n.page) ? n.p : [], q: typed.trim(), sort: n.sort } }];
}
