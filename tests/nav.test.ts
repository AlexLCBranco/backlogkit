// BL-19: the address holds every state; old addresses still open the same pages; breadcrumb and "Go anywhere".
import { describe, expect, it } from 'vitest';
import { crumbs, hrefOf, navLabel, parseHash, resolveProjects, searchFind, titleOf, whereTarget, type Entry, type Nav } from '../src/nav';

const remembered = () => 'name-asc' as const;
const parse = (h: string) => parseHash(h, remembered);

describe('the address', () => {
  it('round-trips every state', () => {
    const states: Nav[] = [
      { page: 'board', p: [], q: '', sort: 'name-asc' },
      { page: 'board', p: ['alpha', 'demo'], q: '', sort: 'name-asc' },
      { page: 'board', p: ['demo'], q: 'dark mode & more+', sort: 'name-asc' },
      { page: 'projects', p: [], q: '', sort: 'push-desc' },
      { page: 'ideas', group: 'never', p: ['zulu'], q: '', sort: 'name-asc' },
      { page: 'ideas', p: [], q: '', sort: 'name-asc' },
      { page: 'built', p: ['a b'], q: '', sort: 'name-asc' },
    ];
    for (const s of states) expect(parse(hrefOf(s)), hrefOf(s)).toEqual(s);
  });
  it('writes short, readable addresses', () => {
    expect(hrefOf({ page: 'board', p: [], q: '', sort: 'name-asc' })).toBe('#/');
    expect(hrefOf({ page: 'board', p: ['alpha', 'demo'], q: '', sort: 'name-asc' })).toBe('#/?p=alpha,demo');
    expect(hrefOf({ page: 'projects', p: ['demo'], q: '', sort: 'push-desc' })).toBe('#/projects?sort=push-desc'); // no What on Projects
    expect(hrefOf({ page: 'ideas', group: 'later', p: [], q: '', sort: 'name-asc' })).toBe('#/ideas/later');
  });
  it('old addresses keep working', () => {
    expect(parse('#/p/ZULU')).toEqual({ page: 'board', p: ['ZULU'], q: '', sort: 'name-asc' });
    expect(parse('#/all')).toEqual({ page: 'board', p: [], q: '', sort: 'name-asc' });
    expect(parse('')).toEqual({ page: 'board', p: [], q: '', sort: 'name-asc' });
    expect(parse('#/projects?q=x')).toMatchObject({ page: 'projects', q: 'x' });
    expect(parse('#/ideas/bogus')).toEqual({ page: 'ideas', p: [], q: '', sort: 'name-asc' });
  });
  it('the order comes from the address, else the remembered one', () => {
    expect(parse('#/projects?sort=created-asc').sort).toBe('created-asc');
    expect(parse('#/projects?sort=nonsense').sort).toBe('name-asc');
    expect(parse('#/projects').sort).toBe('name-asc');
  });
  it('project names match any spelling; unknown ones are dropped; chip order kept', () => {
    expect(resolveProjects(['ZULU', 'nope', 'alpha', 'zulu'], ['alpha', 'demo', 'zulu'])).toEqual(['alpha', 'zulu']);
  });
});

describe('the header', () => {
  const n = (h: string) => parse(h);
  it('breadcrumb: place, projects, idea group, search', () => {
    const labels = (h: string) => crumbs(n(h), ['alpha', 'demo']).map((c) => c.label);
    expect(labels('#/')).toEqual(['Home']);
    expect(labels('#/?p=demo')).toEqual(['Home', 'demo']);
    expect(labels('#/built?p=alpha,demo')).toEqual(['Built', '2 projects']);
    expect(labels('#/ideas/never?p=demo')).toEqual(['Ideas', 'demo', 'Maybe never']);
    expect(labels('#/projects?q=dark')).toEqual(['Home', 'Search “dark”']);
    expect(navLabel(n('#/ideas/never?p=demo'))).toBe('Ideas › demo › Maybe never');
  });
  it('every breadcrumb part but a search jumps to its siblings', () => {
    const [place, project, group] = crumbs(n('#/ideas/later?p=demo'), ['alpha', 'demo']);
    expect(place!.items.map((i) => [i.label, hrefOf(i.to), i.on])).toEqual([
      ['Home', '#/?p=demo', false],
      ['Projects', '#/projects?sort=name-asc', false],
      ['Ideas', '#/ideas?p=demo', true],
      ['Built', '#/built?p=demo', false],
      ['Build order', '#/order?p=demo', false],
    ]);
    expect(project!.items.map((i) => [i.label, hrefOf(i.to)])).toEqual([
      ['All projects', '#/ideas/later'],
      ['alpha', '#/ideas/later?p=alpha'],
      ['demo', '#/ideas/later?p=demo'],
    ]);
    expect(group!.items.find((i) => i.on)!.label).toBe('Not important yet');
    expect(crumbs(n('#/?q=x'), []).at(-1)!.items).toEqual([]);
  });
  it('Where tabs keep the chosen projects and leave a search', () => {
    expect(hrefOf(whereTarget(n('#/?p=demo&q=x'), 'built'))).toBe('#/built?p=demo');
    expect(hrefOf(whereTarget(n('#/?p=demo'), 'projects'))).toBe('#/projects?sort=name-asc');
  });
  it('the tab title follows the page', () => {
    expect(titleOf(n('#/ideas/never'))).toBe('backlogkit · Ideas');
    expect(titleOf(n('#/built?q=%20x%20'))).toBe('backlogkit · search “x”');
  });
});

describe('Go anywhere', () => {
  const to: Nav = { page: 'board', p: [], q: '', sort: 'name-asc' };
  const entries: Entry[] = [
    { label: 'Home', kind: 'Page', to },
    { label: 'demo', kind: 'Project', to: { ...to, p: ['demo'] } },
    { label: 'BL-4 — Sort the demo cards', kind: 'backlogkit · Done', to: { ...to, q: 'BL-4' } },
    { label: 'DM-1 — First thing', kind: 'demo · Will be built next', to: { ...to, q: 'DM-1' } },
  ];
  it('nothing typed: the pages and projects', () => {
    expect(searchFind(entries, '', to).map((e) => e.label)).toEqual(['Home', 'demo']);
  });
  it('label starts first, then word starts, then anywhere; every word must match; search everything last', () => {
    expect(searchFind(entries, 'demo', to).map((e) => e.label)).toEqual(['demo', 'BL-4 — Sort the demo cards', 'DM-1 — First thing', 'Search everything for “demo”']);
    expect(searchFind(entries, 'first demo', to).map((e) => e.label)).toEqual(['DM-1 — First thing', 'Search everything for “first demo”']);
    expect(searchFind(entries, 'zzz', to).map((e) => [e.label, hrefOf(e.to)])).toEqual([['Search everything for “zzz”', '#/?q=zzz']]);
  });
});
