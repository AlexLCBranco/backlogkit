// The home page's card order (BL-4), applied inside each status group. Repos with an unknown date go last in any date
// sort, both directions; ties fall back to the name, A–Z. The choice is remembered in this browser only.
import type { Project } from './types';

export type SortKey = 'backlog-desc' | 'backlog-asc' | 'push-desc' | 'push-asc' | 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'backlog-desc', label: 'Backlog changed — newest first' },
  { value: 'backlog-asc', label: 'Backlog changed — oldest first' },
  { value: 'push-desc', label: 'Last change — newest first' },
  { value: 'push-asc', label: 'Last change — oldest first' },
  { value: 'created-desc', label: 'Created — newest first' },
  { value: 'created-asc', label: 'Created — oldest first' },
  { value: 'name-asc', label: 'Name — A–Z' },
  { value: 'name-desc', label: 'Name — Z–A' },
];
export const DEFAULT_SORT: SortKey = 'backlog-desc';
export const SORT_STORAGE_KEY = 'backlogkit.sort';

const DATE_OF: Record<string, (p: Project) => string | null | undefined> = {
  backlog: (p) => p.backlogChangedAt,
  push: (p) => p.github?.pushedAt,
  created: (p) => p.github?.createdAt,
};

const byName = (a: Project, b: Project) => a.repo.localeCompare(b.repo, 'en', { sensitivity: 'base' });

export function sortProjects(list: Project[], key: SortKey): Project[] {
  const [field, dir] = key.split('-') as [string, 'asc' | 'desc'];
  const sign = dir === 'asc' ? 1 : -1;
  if (field === 'name') return [...list].sort((a, b) => sign * byName(a, b));
  const time = (p: Project) => {
    const t = Date.parse(DATE_OF[field]!(p) ?? '');
    return Number.isNaN(t) ? null : t;
  };
  return [...list].sort((a, b) => {
    const [x, y] = [time(a), time(b)];
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1; // unknown dates last
    return x === y ? byName(a, b) : sign * (x - y);
  });
}

const isKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.value === v);

export function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return isKey(v) ? v : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSort(key: SortKey) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, key);
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}
