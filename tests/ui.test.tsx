// @vitest-environment jsdom
// The pages, rendered from mocked GitHub data (the same loadAll the function runs).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadAll } from '../lib/github.mjs';
import { View, parseHash, titleOf, cardTooltip } from '../src/App';
import { FILTER_STORAGE_KEY, boardItems, builtCounts, builtCutoff, builtGroups, matches, repoColor } from '../src/board';
import type { Data } from '../src/types';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from './fixtures';

let data: Data;
beforeAll(async () => {
  const { fetchImpl } = mockGithub({
    repos: [{ name: 'demo' }, { name: 'other' }, { name: 'broken', private: true }, { name: 'bare' }],
    files: { demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS }, other: { 'FEATURE_BACKLOG.md': '## Ready\n\n### OT-10 — Other ten\nmentions DM-1 in passing\n\n## Held\n\n### OT-11 — Other held\nBlocked: needs a key.\n', 'BUILT.md': '## 2026-11-17\n- OT-1 — Other built (v2.0.0)\n', 'IDEAS.md': '# Ideas\n\nNone yet.\n' }, backlogkit: { 'UNASSIGNED_IDEAS.md': '# Unassigned\n\n- U-1 — Orphan gadget (2026-11-18)\n' } },
    fails: { broken: 403 },
    projectsJson: projectsJson([
      { repo: 'demo', description: 'Demo app', url: 'https://demo.vercel.app', status: 'active', devices: ['desktop'] },
      { repo: 'other', description: null, url: null, status: 'paused', devices: null },
      { repo: 'broken', description: 'Locked away', url: null, status: 'active', devices: ['desktop'] },
    ]),
  });
  data = (await loadAll({ token: 'tok', fetchImpl })) as Data;
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const NOW = new Date(2026, 10, 19, 12); // 2026-11-19, local time
const show = (hash: string, now = NOW) => {
  const { route, q } = parseHash(hash);
  return render(<View data={data} route={route} q={q} go={() => {}} now={now} />);
};
const col = (key: string) => screen.getByTestId(`col-${key}`);
const lines = (key: string) => within(col(key)).queryAllByTestId('board-item').map((i) => i.querySelector('summary')!.textContent);
const heads = () => screen.getAllByTestId(/^col-/).map((c) => c.querySelector('h2')!.textContent);
const openBuilt = () => fireEvent.click(screen.getByTestId('built-toggle'));
const dotsOf = (key: string) => within(col(key)).queryAllByTestId('repo-dot').map((d) => d.getAttribute('title'));

describe('board (BL-9, redesigned in BL-12)', () => {
  it('is the home page: Now, Next, Built stacked in that order, with counts; no Later', () => {
    show('#/');
    expect(screen.getAllByTestId(/^col-/).map((c) => c.dataset.testid)).toEqual(['col-now', 'col-next', 'col-built']);
    expect(heads()).toEqual(['Now 3', 'Next 2', '▸Built (7 days) 5 — demo 4 · other 1']);
    expect(screen.queryByTestId('col-later')).toBeNull();
    expect(screen.queryByTestId('board-summary')).toBeNull(); // the repeated "Now 1 · Next 1 · …" line is gone
  });
  it('no idea (I-n or U-n) is ever on the board, not even when searched for', () => {
    show('#/');
    openBuilt();
    const text = screen.getAllByTestId('board-item').map((i) => i.textContent).join('\n');
    expect(text).not.toMatch(/\b[IU]-\d+/);
    expect(text).not.toContain('Dark mode toggle');
    expect(boardItems(data, 'name-asc', null).some((i) => /^[IU]-/.test(i.id ?? ''))).toBe(false);
    cleanup();
    show('#/?q=dark mode');
    expect(screen.queryAllByTestId('board-item')).toHaveLength(0);
  });
  it('a Held item lands in Next, a Ready item in Now; the repo is a colour dot, the name on hover', () => {
    show('#/');
    expect(lines('next')).toEqual(['DM-3Later thing', 'OT-11Other heldBlocked']);
    expect(lines('now')).toEqual(['DM-1First thing', 'DM-2Stuck thingBlocked', 'OT-10Other ten']);
    expect(dotsOf('now')).toEqual(['demo', 'demo', 'other']);
    const [a, , c] = within(col('now')).getAllByTestId('repo-dot') as HTMLElement[];
    expect(a!.style.background).not.toBe('');
    expect(c!.style.background).not.toBe(a!.style.background);
    expect(repoColor('demo')).toBe(repoColor('demo')); // stable
    expect(document.querySelector('.bitem .tag')).toBeNull(); // no grey text pill
  });
  it('a Blocked item keeps its section with a badge', () => {
    show('#/');
    expect(within(col('now')).getAllByText('Blocked')).toHaveLength(1);
  });
  it('Built is one collapsed line with per-repo counts; a click opens it grouped by repo, each repo once', () => {
    show('#/');
    expect(screen.getByTestId('built-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('built-counts').textContent).toBe(' — demo 4 · other 1');
    expect(lines('built')).toEqual([]);
    openBuilt();
    expect(screen.getByTestId('built-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('built-group').map((g) => g.dataset.repo)).toEqual(['demo', 'other']);
    expect(lines('built')).toEqual(['DM-5Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line', 'DM-0Older thing (v1.1.0)', 'OT-1Other built (v2.0.0)']);
    expect(within(col('built')).getByRole('link', { name: 'All built' }).getAttribute('href')).toBe('#/built');
    openBuilt();
    expect(lines('built')).toEqual([]);
  });
  it('Built groups: most items first, each repo once, newest first within a repo', () => {
    const g = builtGroups(boardItems(data, 'name-asc', null));
    expect(g.map((x) => x.repo)).toEqual(['demo', 'other']);
    expect(g[0]!.items.map((i) => i.date)).toEqual(['2026-11-17', '2026-11-17', '2026-11-16', '2026-11-15']);
    expect(builtCounts(g)).toBe('demo 4 · other 1');
  });
  it('Built keeps the last 7 days only', () => {
    show('#/', new Date(2026, 10, 22, 12)); // 7 days: 2026-11-16 … 2026-11-22
    openBuilt();
    expect(lines('built')).toEqual(['DM-5Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line', 'OT-1Other built (v2.0.0)']);
    expect(builtCutoff(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-16');
    expect(builtCutoff(new Date(2026, 11, 3))).toBe('2026-11-27');
  });
  it('an empty section shows one muted "Nothing here", not an empty box; empty Built cannot be opened', () => {
    show('#/', new Date(2027, 5, 1));
    expect(col('built').classList.contains('is-empty')).toBe(true);
    expect(within(col('built')).getByText('Nothing here')).toBeTruthy();
    expect((screen.getByTestId('built-toggle') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    show('#/?q=OT-10');
    expect(within(col('next')).getByText('Nothing here').className).toContain('muted');
    expect(col('next').classList.contains('is-empty')).toBe(true);
    expect(col('now').classList.contains('is-empty')).toBe(false);
  });
  it('no "no estimates yet" line; a total only where something is estimated', () => {
    show('#/');
    expect(screen.queryByTestId('estimate-total')).toBeNull();
    expect(document.body.textContent).not.toContain('no estimates yet');
  });
  it('a line opens the full spec in place and closes again', () => {
    show('#/');
    const item = within(col('now')).getAllByTestId('board-item')[0] as HTMLDetailsElement;
    expect(item.open).toBe(false);
    fireEvent.click(item.querySelector('summary')!);
    expect(item.open).toBe(true);
    expect(item.querySelector('.body')!.textContent).toContain('Line one of the spec.\n- a bullet');
    fireEvent.click(item.querySelector('summary')!);
    expect(item.open).toBe(false);
  });
  it('every item has a copy button', () => {
    show('#/');
    openBuilt();
    for (const i of screen.getAllByTestId('board-item')) expect(within(i).getByRole('button', { name: /^Copy / })).toBeTruthy();
  });
  it('project chips filter the board and are remembered; All clears; one repo shown hides the dots', () => {
    show('#/');
    fireEvent.click(screen.getByRole('button', { name: 'other' }));
    expect(heads()).toEqual(['Now 1', 'Next 1', '▸Built (7 days) 1 — other 1']);
    expect(screen.queryAllByTestId('repo-dot')).toHaveLength(0);
    openBuilt();
    expect(screen.queryAllByTestId('repo-dot')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual(['other']);
    cleanup();
    show('#/');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'demo' }));
    expect(lines('now')).toHaveLength(3);
    expect(dotsOf('now')).toEqual(['demo', 'demo', 'other']); // two repos: dots again
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(heads()).toEqual(['Now 3', 'Next 2', '▸Built (7 days) 5 — demo 4 · other 1']);
  });
  it('an old project URL opens the board filtered to that project (any spelling)', () => {
    expect(parseHash('#/p/demo').route).toEqual({ page: 'board', only: 'demo' });
    expect(parseHash('#/all').route).toEqual({ page: 'board' });
    show('#/p/OTHER');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    expect(lines('now')).toEqual(['OT-10Other ten']);
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual(['other']);
  });
  it('the old project page and All repos view are gone', () => {
    show('#/p/demo');
    expect(screen.queryByTestId('planned')).toBeNull();
    expect(screen.queryByTestId('all-planned')).toBeNull();
  });
});

describe('search on the board', () => {
  const all = () => boardItems(data, 'name-asc', null);
  const find = (q: string) => all().filter((i) => matches(i, q));
  it('an ID matches only that ID', () => {
    expect(find('DM-1').map((h) => h.id)).toEqual(['DM-1']);
    expect(find('ot-1').map((h) => h.id)).toEqual(['OT-1']);
  });
  it('text matches titles and full text, every word required', () => {
    expect(find('thing').map((h) => h.id).sort()).toEqual(['DM-0', 'DM-1', 'DM-2', 'DM-3', 'DM-5']); // I-2 is an idea: not on the board
    expect(find('colour choice').map((h) => h.id)).toEqual(['DM-2']);
    expect(find('passing').map((h) => h.repo)).toEqual(['other']);
    expect(find('dark mode')).toEqual([]); // ideas live on the Ideas page only
    expect(find('orphan')).toEqual([]);
  });
  it('a query shows the board from any page, Built searched across every day', () => {
    show('#/projects?q=older', new Date(2027, 0, 1));
    expect(lines('built')).toEqual(['DM-0Older thing (v1.1.0)']);
    expect(heads()).toEqual(['Now 0', 'Next 0', '▾Built 1 — demo 1']); // open while searching
    cleanup();
    show('#/?q=stuck');
    expect(lines('now')).toEqual(['DM-2Stuck thingBlocked']);
  });
});

describe('projects page (BL-10 compact cards)', () => {
  it('groups cards active → paused → no status, repos without lists at the bottom', () => {
    show('#/projects');
    const groups = screen.getAllByTestId(/^group-/).map((g) => g.dataset.testid);
    expect(groups).toEqual(['group-active', 'group-paused', 'group-nofiles']);
    expect(within(screen.getByTestId('group-nofiles')).getByTestId('card-bare')).toBeTruthy();
  });
  it('a card shows the one-line meta, links and counts', () => {
    show('#/projects');
    const demo = screen.getByTestId('card-demo');
    expect(within(demo).getByTestId('meta-line').textContent).toBe('v1.3.0 · desktop · pushed 2026-11-17 · built 2026-11-17');
    expect(within(demo).getByRole('link', { name: 'demo.vercel.app' }).getAttribute('href')).toBe('https://demo.vercel.app');
    expect(within(demo).getByRole('link', { name: 'repo' }).getAttribute('href')).toBe('https://github.com/AlexLCBranco/demo');
    expect(within(demo).getByTestId('counts').textContent).toBe('Planned 3 (Ready 2 / Held 1) · Blocked 1 · Ideas 2');
    expect(demo.querySelector('dl')).toBeNull();
    expect(demo.textContent).not.toContain('Backlog changed');
    expect(demo.textContent).not.toContain('Suite time');
  });
  it('a missing field shows a dash', () => {
    show('#/projects');
    const other = screen.getByTestId('card-other');
    expect(other.querySelector('.desc')!.textContent).toBe('—');
    expect(within(other).getByTestId('meta-line').textContent).toBe('v2.0.0 · — · pushed 2026-11-17 · built 2026-11-17');
    expect(within(other).getByTestId('live-link').textContent).toBe('—');
    const broken = screen.getByTestId('card-broken');
    expect(within(broken).getByTestId('meta-line').textContent).toBe('— · desktop · pushed 2026-11-17 · built —');
  });
  it('suite time and estimates are in the tooltip', () => {
    show('#/projects');
    const demo = data.projects.find((p) => p.repo === 'demo')!;
    expect(cardTooltip(demo)).toBe('Suite time: last 3 min · longest 9 min\nEstimated: — (no estimates yet)');
    expect(screen.getByTestId('card-demo').getAttribute('title')).toBe(cardTooltip(demo));
    expect(cardTooltip(data.projects.find((p) => p.repo === 'broken')!)).toBe('Suite time: —\nEstimated: —');
  });
  it('the card links to the board filtered to it', () => {
    show('#/projects');
    expect(within(screen.getByTestId('card-demo')).getByRole('link', { name: 'demo' }).getAttribute('href')).toBe('#/p/demo');
  });
  it('an unreadable repo shows its reason', () => {
    show('#/projects');
    expect(within(screen.getByTestId('card-broken')).getByRole('alert').textContent).toMatch(/Not read: .*HTTP 403/);
  });
});

describe('all built page', () => {
  it('lists every built item by day, newest first', () => {
    show('#/built', new Date(2030, 0, 1));
    const days = screen.getAllByTestId('all-built-day');
    expect(days.map((d) => d.querySelector('h4')!.textContent)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
    expect(days[0]!.textContent).toMatch(/demo.*DM-5.*other.*OT-1/s);
  });
});

describe('ideas page (BL-7)', () => {
  it('shows Unassigned first, then each repo with ideas, linked; repos without ideas left out', () => {
    show('#/ideas');
    const blocks = screen.getAllByTestId(/^ideas-/).map((b) => b.dataset.testid);
    expect(blocks).toEqual(['ideas-unassigned', 'ideas-demo']); // other has an IDEAS.md with no items
    expect(within(screen.getByTestId('ideas-unassigned')).getAllByTestId('idea').map((i) => i.textContent)).toEqual(['U-1 Orphan gadget (2026-11-18)']);
    const demo = screen.getByTestId('ideas-demo');
    expect(within(demo).getByRole('link', { name: 'demo' }).getAttribute('href')).toBe('#/p/demo');
    expect(within(demo).getAllByTestId('idea')).toHaveLength(2);
    expect(within(demo).getByRole('button', { name: 'Copy I-1' })).toBeTruthy();
  });
  it('never shows ideas in Next, Now or Built', () => {
    show('#/');
    for (const c of ['next', 'now', 'built']) expect(col(c).textContent).not.toContain('Dark mode toggle');
  });
  it('an empty Unassigned group says so', () => {
    render(<View data={{ ...data, unassigned: { file: true, ideas: [] } }} route={{ page: 'ideas' }} q="" go={() => {}} />);
    expect(screen.getByTestId('ideas-unassigned').textContent).toContain('No unassigned ideas.');
  });
});

describe('tab title', () => {
  it('names what is open', () => {
    expect(titleOf({ page: 'board' })).toBe('backlogkit · Board');
    expect(titleOf({ page: 'projects' })).toBe('backlogkit · Projects');
    expect(titleOf({ page: 'ideas' })).toBe('backlogkit · Ideas');
    expect(titleOf({ page: 'built' })).toBe('backlogkit · Built');
    expect(titleOf({ page: 'projects' }, '  dark ')).toBe('backlogkit · search “dark”');
  });
});

describe('the token', () => {
  it('is never in the rendered pages', async () => {
    const { fetchImpl } = mockGithub({ repos: [{ name: 'demo' }], files: { demo: { 'BUILT.md': BUILT } }, fails: {}, projectsJson: projectsJson([{ repo: 'demo' }, { repo: 'gone' }]) });
    const d = (await loadAll({ token: 'SECRET-TOKEN-XYZ', fetchImpl })) as Data;
    for (const hash of ['#/', '#/projects', '#/built', '#/ideas', '#/?q=a']) {
      const { container, unmount } = render(<View data={d} {...parseHash(hash)} go={() => {}} />);
      expect(container.innerHTML).not.toContain('SECRET-TOKEN-XYZ');
      unmount();
    }
  });
});
