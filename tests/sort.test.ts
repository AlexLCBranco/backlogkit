// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SORT, SORT_OPTIONS, SORT_STORAGE_KEY, loadSort, saveSort, sortProjects, type SortKey } from '../src/sort';
import type { Project } from '../src/types';

const p = (repo: string, backlog: string | null, pushed: string | null, created: string | null) =>
  ({ repo, backlogChangedAt: backlog, github: { pushedAt: pushed, createdAt: created } }) as unknown as Project;
const list = [
  p('bravo', '2026-11-10T00:00:00Z', '2026-11-12T00:00:00Z', '2025-03-01T00:00:00Z'),
  p('alpha', '2026-11-15T00:00:00Z', '2026-11-01T00:00:00Z', null),
  p('delta', null, '2026-11-17T00:00:00Z', '2026-06-01T00:00:00Z'),
  p('Charlie', '2026-11-01T00:00:00Z', null, '2024-01-01T00:00:00Z'),
  { ...p('echo', null, null, null), github: null } as unknown as Project, // not on GitHub: every date unknown
];
const order = (key: SortKey) => sortProjects(list, key).map((x) => x.repo);

describe('sortProjects (BL-4)', () => {
  it.each<[SortKey, string[]]>([
    ['backlog-desc', ['alpha', 'bravo', 'Charlie', 'delta', 'echo']],
    ['backlog-asc', ['Charlie', 'bravo', 'alpha', 'delta', 'echo']],
    ['push-desc', ['delta', 'bravo', 'alpha', 'Charlie', 'echo']],
    ['push-asc', ['alpha', 'bravo', 'delta', 'Charlie', 'echo']],
    ['created-desc', ['delta', 'bravo', 'Charlie', 'alpha', 'echo']],
    ['created-asc', ['Charlie', 'bravo', 'delta', 'alpha', 'echo']],
    ['name-asc', ['alpha', 'bravo', 'Charlie', 'delta', 'echo']],
    ['name-desc', ['echo', 'delta', 'Charlie', 'bravo', 'alpha']],
  ])('%s', (key, want) => expect(order(key)).toEqual(want));

  it('every option is covered, default is backlog changed, newest first', () => {
    expect(SORT_OPTIONS.map((o) => o.value).sort()).toEqual(['backlog-asc', 'backlog-desc', 'created-asc', 'created-desc', 'name-asc', 'name-desc', 'push-asc', 'push-desc']);
    expect(DEFAULT_SORT).toBe('backlog-desc');
  });
  it('does not change the list it was given', () => {
    const before = list.map((x) => x.repo);
    sortProjects(list, 'name-desc');
    expect(list.map((x) => x.repo)).toEqual(before);
  });
});

describe('remembered choice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('saves and loads; junk or nothing → the default', () => {
    expect(loadSort()).toBe('backlog-desc');
    saveSort('name-desc');
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('name-desc');
    expect(loadSort()).toBe('name-desc');
    localStorage.setItem(SORT_STORAGE_KEY, 'bogus');
    expect(loadSort()).toBe('backlog-desc');
  });
  it('blocked storage never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadSort()).toBe('backlog-desc');
    expect(() => saveSort('name-asc')).not.toThrow();
  });
});
