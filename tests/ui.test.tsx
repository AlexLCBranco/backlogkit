// @vitest-environment jsdom
// The pages, rendered from mocked GitHub data (the same loadAll the function runs).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadAll } from '../lib/github.mjs';
import { View, parseHash, titleOf, cardTooltip } from '../src/App';
import { FILTER_STORAGE_KEY, boardItems, builtCutoff, matches } from '../src/board';
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

describe('board (BL-9)', () => {
  it('is the home page: four columns left to right with counts', () => {
    show('#/');
    expect(screen.getAllByTestId(/^col-/).map((c) => c.dataset.testid)).toEqual(['col-later', 'col-next', 'col-now', 'col-built']);
    expect([...document.querySelectorAll('.col h2')].map((h) => h.textContent)).toEqual(['Later 3', 'Next 2', 'Now 3', 'Built (7 days) 5']);
  });
  it('a Held item lands in Next, a Ready item in Now, ideas (Unassigned first) in Later', () => {
    show('#/');
    expect(lines('later')).toEqual(['unassignedU-1Orphan gadget (2026-11-18)', 'demoI-1Dark mode toggle (2026-11-01)', 'demoI-2Something long that wraps (2026-11-02)']);
    expect(lines('next')).toEqual(['demoDM-3Later thing', 'otherOT-11Other heldBlocked']);
    expect(lines('now')).toEqual(['demoDM-1First thing', 'demoDM-2Stuck thingBlocked', 'otherOT-10Other ten']);
  });
  it('a Blocked item keeps its column with a badge and is counted once', () => {
    show('#/');
    expect(within(col('now')).getAllByText('Blocked')).toHaveLength(1);
    expect(screen.getByTestId('board-summary').textContent).toBe('Now 3 · Next 2 · Later 3 · Blocked 2 · Built (7 days) 5');
  });
  it('Built: newest day first, projects within a day, Internal left out, older than 7 days dropped, All built link', () => {
    show('#/');
    expect(lines('built')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'otherOT-1Other built (v2.0.0)', 'demov1.2.0: old style line', 'demoDM-0Older thing (v1.1.0)']);
    expect(within(col('built')).getByRole('link', { name: 'All built' }).getAttribute('href')).toBe('#/built');
    cleanup();
    show('#/', new Date(2026, 10, 22, 12)); // 7 days: 2026-11-16 … 2026-11-22
    expect(lines('built')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'otherOT-1Other built (v2.0.0)', 'demov1.2.0: old style line']);
    expect(builtCutoff(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-16');
    expect(builtCutoff(new Date(2026, 11, 3))).toBe('2026-11-27');
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
    for (const i of screen.getAllByTestId('board-item')) expect(within(i).getByRole('button', { name: /^Copy / })).toBeTruthy();
  });
  it('project chips filter the board and are remembered; All clears', () => {
    show('#/');
    fireEvent.click(screen.getByRole('button', { name: 'other' }));
    expect(screen.getByTestId('board-summary').textContent).toBe('Now 1 · Next 1 · Later 0 · Blocked 1 · Built (7 days) 1');
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual(['other']);
    cleanup();
    show('#/');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'demo' }));
    expect(lines('now')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('board-summary').textContent).toBe('Now 3 · Next 2 · Later 3 · Blocked 2 · Built (7 days) 5');
  });
  it('an old project URL opens the board filtered to that project (any spelling)', () => {
    expect(parseHash('#/p/demo').route).toEqual({ page: 'board', only: 'demo' });
    expect(parseHash('#/all').route).toEqual({ page: 'board' });
    show('#/p/OTHER');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    expect(lines('now')).toEqual(['otherOT-10Other ten']);
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
    expect(find('thing').map((h) => h.id).sort()).toEqual(['DM-0', 'DM-1', 'DM-2', 'DM-3', 'DM-5', 'I-2']);
    expect(find('colour choice').map((h) => h.id)).toEqual(['DM-2']);
    expect(find('passing').map((h) => h.repo)).toEqual(['other']);
    expect(find('dark mode').map((h) => h.column)).toEqual(['later']);
    expect(find('orphan').map((h) => [h.repo, h.id])).toEqual([['unassigned', 'U-1']]);
  });
  it('a query shows the board from any page, Built searched across every day', () => {
    show('#/projects?q=older', new Date(2027, 0, 1));
    expect(lines('built')).toEqual(['demoDM-0Older thing (v1.1.0)']);
    expect(screen.getByTestId('board-summary').textContent).toMatch(/^Now 0 · Next 0 · Later 0 · Blocked 0 · Built 1/);
    cleanup();
    show('#/?q=stuck');
    expect(lines('now')).toEqual(['demoDM-2Stuck thingBlocked']);
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
