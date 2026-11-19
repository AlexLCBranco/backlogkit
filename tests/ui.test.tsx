// @vitest-environment jsdom
// The pages, rendered from mocked GitHub data (the same loadAll the function runs).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OwnerContext, applyMove, type MoveRequest, type Owner } from '../src/owner';
import { loadAll } from '../lib/github.mjs';
import { View, parseHash, titleOf, cardTooltip } from '../src/App';
import { SEEN_STORAGE_KEY, doneKey, loadSeen, markSeen, newCutoff, newDone, saveSeen, FILTER_STORAGE_KEY, LANES, boardIdeas, boardItems, builtCutoff, builtGroups, ideaMatches, laneCounts, laneOf, matches } from '../src/board';
import type { Data } from '../src/types';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from './fixtures';

let data: Data;
beforeAll(async () => {
  const { fetchImpl } = mockGithub({
    repos: [{ name: 'demo' }, { name: 'other' }, { name: 'broken', private: true }, { name: 'bare' }],
    files: { demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS }, other: { 'FEATURE_BACKLOG.md': '## Ready\n\n### OT-10 — Other ten\n**In short:** Other gets ten.\nmentions DM-1 in passing\n\n## Held\n\n### OT-11 — Other held\nBlocked: needs a key.\n', 'BUILT.md': '## 2026-11-17\n- OT-1 — Other built (v2.0.0)\n', 'IDEAS.md': '# Ideas\n\nNone yet.\n' }, backlogkit: { 'UNASSIGNED_IDEAS.md': '# Unassigned\n\n- U-1 — Orphan gadget (2026-11-18) [why: never]\n' } },
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
const lane = (key: string) => screen.getByTestId(`lane-${key}`);
// A row as "label | sentence | ID"; a sentence ending in * has the "no summary yet" tag (BL-15).
const row = (s: Element) => {
  const title = s.querySelector('.title')!;
  const text = (title.firstChild!.textContent ?? '') + (title.querySelector('.no-summary') ? '*' : '');
  return [s.querySelector('.tag')!.textContent, text, s.querySelector('.id')?.textContent].filter(Boolean).join(' | ');
};
const lines = (key: string) => within(lane(key)).queryAllByTestId('board-item').map((i) => row(i.querySelector('summary')!));
const heads = () => screen.getAllByTestId(/^lane-/).map((c) => c.querySelector('h2')!.textContent);
const strip = () => LANES.map((l) => screen.getByTestId(`strip-${l.key}`).querySelector('b')!.textContent);
const ALL_HEADS = ['Stuck – needs you 2', 'Will be built next 2', 'Waiting for your OK 1', 'Ideas 3', 'Done 5'];

describe('home page: five lanes (BL-14)', () => {
  it('shows the five lanes in fixed order with counts, and the number strip with the same numbers', () => {
    show('#/');
    expect(screen.getAllByTestId(/^lane-/).map((c) => c.dataset.testid)).toEqual(['lane-stuck', 'lane-next', 'lane-waiting', 'lane-ideas', 'lane-done']);
    expect(heads()).toEqual(ALL_HEADS);
    expect(strip()).toEqual(['2', '2', '1', '3', '5']);
    expect([...screen.getByTestId('strip').querySelectorAll('span')].map((s) => s.textContent)).toEqual(LANES.map((l) => l.label));
  });
  it('lane assignment: blocked in Ready → Stuck, blocked in Held → Stuck, never counted twice', () => {
    expect(laneOf('ready', true)).toBe('stuck');
    expect(laneOf('held', true)).toBe('stuck');
    expect(laneOf('ready', false)).toBe('next');
    expect(laneOf('held', false)).toBe('waiting');
    const items = boardItems(data, 'name-asc', builtCutoff(NOW));
    const ids = items.filter((i) => i.lane !== 'done').map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(laneCounts(items, boardIdeas(data, 'name-asc'))).toEqual({ stuck: 2, next: 2, waiting: 1, ideas: 3, done: 5 });
    show('#/');
    expect(lines('stuck')).toEqual(['demo | Stuck thing* | DM-2', 'other | Other held* | OT-11']);
    expect(lines('next')).toEqual(['demo | First thing* | DM-1', 'other | Other gets ten. | OT-10']);
    expect(lines('waiting')).toEqual(['demo | Later thing* | DM-3']);
  });
  it('the Stuck number is red above 0 and grey at 0', () => {
    show('#/');
    expect(screen.getByTestId('strip-stuck').classList.contains('has')).toBe(true);
    cleanup();
    show('#/?q=DM-1');
    expect(screen.getByTestId('strip-stuck').classList.contains('has')).toBe(false);
  });
  it('clicking a number scrolls to its lane', () => {
    show('#/');
    const seen: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this.id);
    };
    for (const l of LANES) fireEvent.click(screen.getByTestId(`strip-${l.key}`));
    expect(seen).toEqual(LANES.map((l) => `lane-${l.key}`));
  });
  it('an empty lane shows one muted line', () => {
    show('#/?q=DM-3', new Date(2027, 5, 1));
    expect(within(lane('stuck')).getByText('Nothing stuck.').className).toContain('muted');
    expect(within(lane('next')).getByText('Nothing to build next.')).toBeTruthy();
    expect(within(lane('ideas')).getByText('No ideas.')).toBeTruthy();
    expect(within(lane('done')).getByText('Nothing built matches.')).toBeTruthy();
    expect(lane('stuck').classList.contains('is-empty')).toBe(true);
    expect(lane('waiting').classList.contains('is-empty')).toBe(false);
  });
  it('Ideas: one row per non-empty reason group with its count and first idea, linking to that group (BL-17); no idea in another lane', () => {
    show('#/');
    const rows = within(lane('ideas')).getAllByTestId('ideas-row');
    expect(rows.map((r) => r.textContent)).toEqual(['No reason yet 2 Dark mode toggle', 'Maybe never 1 Orphan gadget']);
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#/ideas/none', '#/ideas/never']);
    const text = screen.getAllByTestId('board-item').map((i) => i.textContent).join('\n');
    expect(text).not.toMatch(/\b[IU]-\d+/);
  });
  it('Done, first visit: the last 7 days are new, one row per project, a click unfolds its items (BL-18)', () => {
    show('#/');
    expect(screen.getByTestId('done-summary').textContent).toBe('5 new since you last looked');
    const rows = screen.getAllByTestId('done-group');
    expect(rows.map((g) => g.querySelector('.done-row')!.textContent)).toEqual(['▸demo 4 Newest thing (v1.3.0)', '▸other 1 Other built (v2.0.0)']);
    expect(screen.queryAllByTestId('done-item')).toEqual([]);
    fireEvent.click(rows[0]!.querySelector('.done-row')!);
    const items = within(rows[0]!).getAllByTestId('done-item');
    expect(items.map((i) => i.querySelector('.done-title')!.textContent)).toEqual(['Newest thing (v1.3.0)', 'A fix without ID (v1.2.1)', 'v1.2.0: old style line', 'Older thing (v1.1.0)']);
    expect(items[0]!.querySelector('.done-detail')!.textContent).toBe('What the owner sees now.');
    expect(lane('done').textContent).not.toContain('secret housekeeping'); // ### Internal left out
    expect(within(lane('done')).getByRole('link', { name: 'Everything built' }).getAttribute('href')).toBe('#/built');
    expect(screen.getByTestId('strip-done').classList.contains('has')).toBe(true);
    expect(builtCutoff(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-16');
    expect(builtCutoff(new Date(2026, 11, 3))).toBe('2026-11-27');
  });
  it('Mark all seen empties the list, stays empty after a reload, and nothing is marked by itself (BL-18)', () => {
    show('#/');
    cleanup();
    show('#/'); // a reload: still new
    expect(screen.getByTestId('done-summary').textContent).toBe('5 new since you last looked');
    fireEvent.click(screen.getByTestId('mark-seen'));
    expect(screen.getByTestId('done-summary').textContent).toBe('Nothing new · 5 built in the last 7 days');
    expect(screen.queryAllByTestId('done-group')).toEqual([]);
    expect(screen.queryByTestId('mark-seen')).toBeNull();
    expect(screen.getByTestId('strip-done').querySelector('b')!.textContent).toBe('0');
    expect(screen.getByTestId('strip-done').classList.contains('has')).toBe(false);
    cleanup();
    show('#/');
    expect(screen.getByTestId('done-summary').textContent).toBe('Nothing new · 5 built in the last 7 days');
  });
  it('new vs seen vs older than 30 days, with fixed dates (BL-18)', () => {
    const now = new Date(2026, 10, 19, 12);
    const all = boardItems(data, 'name-asc', null);
    const keys = (l: { repo: string; id: string | null; title: string; version: string | null }[]) => l.map(doneKey);
    // First visit: the last 7 days only.
    expect(keys(newDone(all, null, now))).toEqual(['demo#DM-5', 'demo#A fix without ID (v1.2.1)#1.2.1', 'other#OT-1', 'demo#v1.2.0: old style line#1.2.0', 'demo#DM-0']);
    // Seen ones drop out; an unseen one within 30 days but older than 7 is new.
    const later = new Date(2026, 11, 10, 12); // 30 days: 2026-11-11 … 2026-12-10
    expect(keys(newDone(all, ['demo#DM-5', 'other#OT-1'], later))).toEqual(['demo#A fix without ID (v1.2.1)#1.2.1', 'demo#v1.2.0: old style line#1.2.0', 'demo#DM-0']);
    // Older than 30 days: never new.
    expect(newDone(all, [], new Date(2027, 0, 1))).toEqual([]);
    // Marking on the first visit counts the older ones as seen too; keys older than 30 days are dropped.
    const marked = markSeen(all, null, newDone(all, null, now), now);
    expect(newDone(all, marked, now)).toEqual([]);
    expect(markSeen(all, ['gone#X-1', 'demo#DM-5'], [], now)).toEqual(['demo#DM-5']);
    expect(newCutoff(now)).toBe('2026-10-21');
  });
  it('the seen list survives blocked storage (no crash, nothing remembered)', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(loadSeen()).toBeNull();
      expect(() => saveSeen(['x'])).not.toThrow();
    } finally {
      Storage.prototype.getItem = real;
    }
    expect(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) ?? 'null')).toEqual(['x']);
  });
  it('Done groups: most items first, each repo once, newest first within a repo', () => {
    const g = builtGroups(boardItems(data, 'name-asc', null));
    expect(g.map((x) => x.repo)).toEqual(['demo', 'other']);
    expect(g[0]!.items.map((i) => i.date)).toEqual(['2026-11-17', '2026-11-17', '2026-11-16', '2026-11-15']);
  });
  it('a line opens the full spec in place and closes again; every item has a copy button', () => {
    show('#/');
    const item = within(lane('next')).getAllByTestId('board-item')[0] as HTMLDetailsElement;
    expect(item.open).toBe(false);
    fireEvent.click(item.querySelector('summary')!);
    expect(item.open).toBe(true);
    expect(item.querySelector('.body')!.textContent).toContain('Line one of the spec.\n- a bullet');
    fireEvent.click(item.querySelector('summary')!);
    expect(item.open).toBe(false);
    for (const i of screen.getAllByTestId('board-item')) expect(within(i).getByRole('button', { name: /^Copy / })).toBeTruthy();
  });
  it('no "no estimates yet" line; a total only where something is estimated', () => {
    show('#/');
    expect(screen.queryByTestId('estimate-total')).toBeNull();
    expect(document.body.textContent).not.toContain('no estimates yet');
  });
  it('project chips (All projects first) filter the lanes and the strip, and are remembered', () => {
    show('#/');
    const chips = within(screen.getByRole('group', { name: 'Filter by project' })).getAllByRole('button');
    expect(chips[0]!.textContent).toBe('All projects');
    fireEvent.click(screen.getByRole('button', { name: 'other' }));
    expect(heads()).toEqual(['Stuck – needs you 1', 'Will be built next 1', 'Waiting for your OK 0', 'Ideas 0', 'Done 1']); // unassigned ideas only under All
    expect(strip()).toEqual(['1', '1', '0', '0', '1']);
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual(['other']);
    cleanup();
    show('#/');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'demo' }));
    expect(heads()).toEqual(['Stuck – needs you 2', 'Will be built next 2', 'Waiting for your OK 1', 'Ideas 2', 'Done 5']);
    fireEvent.click(screen.getByRole('button', { name: 'All projects' }));
    expect(screen.getByRole('button', { name: 'All projects' }).getAttribute('aria-pressed')).toBe('true');
    expect(heads()).toEqual(ALL_HEADS);
  });
  it('an old project URL opens the home page filtered to that project (any spelling)', () => {
    expect(parseHash('#/p/demo').route).toEqual({ page: 'board', only: 'demo' });
    expect(parseHash('#/all').route).toEqual({ page: 'board' });
    show('#/p/OTHER');
    expect(screen.getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true');
    expect(lines('next')).toEqual(['other | Other gets ten. | OT-10']);
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual(['other']);
  });
  it('one vocabulary: none of Now, Next, Ready, Held or Planned as a label on any page', () => {
    for (const hash of ['#/', '#/projects', '#/ideas', '#/built']) {
      const { container, unmount } = show(hash);
      container.querySelectorAll('.body').forEach((b) => b.remove()); // spec text is the owner's own words
      expect(container.textContent).not.toMatch(/\b(Now|Next|Ready|Held|Planned)\b/);
      for (const el of container.querySelectorAll('[title],[aria-label]'))
        expect(`${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`).not.toMatch(/\b(Now|Next|Ready|Held|Planned)\b/);
      unmount();
    }
  });
});

describe('cards anyone can read (BL-15)', () => {
  it('a card shows the project name as text, the In short sentence, the ID at the right; the title opens with the spec', () => {
    show('#/');
    const item = within(lane('next')).getAllByTestId('board-item')[1] as HTMLDetailsElement;
    const s = item.querySelector('summary')!;
    expect(s.firstElementChild!.textContent).toBe('other');
    expect(s.lastElementChild!.textContent).toBe('OT-10');
    expect(s.querySelector('.title')!.textContent).toBe('Other gets ten.');
    expect(within(item).queryByTestId('no-summary')).toBeNull();
    fireEvent.click(s);
    expect(item.querySelector('.spec-title')!.textContent).toBe('Other ten');
  });
  it('a card without In short shows its title and "no summary yet"', () => {
    show('#/');
    const s = within(lane('next')).getAllByTestId('board-item')[0]!.querySelector('summary')!;
    expect(s.querySelector('.title')!.textContent).toBe('First thingno summary yet');
    expect(within(s as HTMLElement).getByTestId('no-summary')).toBeTruthy();
  });
  it('no coloured dot anywhere; the same project label on home, Ideas and Everything built', () => {
    for (const hash of ['#/', '#/ideas', '#/built']) {
      const { container, unmount } = show(hash);
      expect(container.querySelector('.dot, [data-testid="repo-dot"]')).toBeNull();
      const labels = [...container.querySelectorAll('[data-testid="repo-label"]')];
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(l.className).toMatch(/^tag( tag-unassigned)?$/);
      unmount();
    }
  });
});

describe('search (BL-14: everything)', () => {
  const all = () => boardItems(data, 'name-asc', null);
  const find = (q: string) => all().filter((i) => matches(i, q));
  it('an ID matches only that ID', () => {
    expect(find('DM-1').map((h) => h.id)).toEqual(['DM-1']);
    expect(find('ot-1').map((h) => h.id)).toEqual(['OT-1']);
  });
  it('text matches titles and full text, every word required', () => {
    expect(find('thing').map((h) => h.id).sort()).toEqual(['DM-0', 'DM-1', 'DM-2', 'DM-3', 'DM-5']);
    expect(find('colour choice').map((h) => h.id)).toEqual(['DM-2']);
    expect(find('passing').map((h) => h.repo)).toEqual(['other']);
    expect(boardIdeas(data, 'name-asc').filter((i) => ideaMatches(i, 'dark mode')).map((i) => i.idea.id)).toEqual(['I-1']);
  });
  it('a query shows the home page from any page; Done searched across every day; ideas listed', () => {
    show('#/projects?q=older', new Date(2027, 0, 1));
    expect(lines('done')).toEqual(['demo | Older thing (v1.1.0) | DM-0']);
    expect(heads()).toEqual(['Stuck – needs you 0', 'Will be built next 0', 'Waiting for your OK 0', 'Ideas 0', 'Done 1']);
    cleanup();
    show('#/ideas?q=orphan');
    expect(within(lane('ideas')).getAllByTestId('idea').map((i) => i.textContent)).toEqual(['Unassigned U-1 Orphan gadget']);
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
    expect(within(demo).getByTestId('counts').textContent).toBe('Stuck 1 · Will be built next 1 · Waiting for your OK 1 · Ideas 2');
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

describe('ideas page (BL-7, grouped by reason in BL-17)', () => {
  const groupHeads = () => screen.getAllByTestId(/^why-/).map((g) => g.querySelector('h3')!.textContent);
  it('groups every idea by reason, in order, each with its count; Maybe never last and folded', () => {
    show('#/ideas');
    expect(groupHeads()).toEqual(['Needs your decision 0', 'Waiting on something 0', 'Too big, needs splitting 0', 'Not important yet 0', 'No reason yet 2', 'Maybe never 1']);
    const never = screen.getByTestId('why-never') as HTMLDetailsElement;
    expect(never.tagName).toBe('DETAILS');
    expect(never.open).toBe(false);
    expect(within(never).getAllByTestId('idea').map((i) => i.querySelector('.idea-main')!.textContent)).toEqual(['Unassigned U-1 Orphan gadget']);
    const none = screen.getByTestId('why-none');
    expect(within(none).getAllByTestId('idea').map((i) => i.querySelector('.idea-main')!.textContent)).toEqual(['demo I-1 Dark mode toggle', 'demo I-2 Something long that wraps']);
    expect(within(none).getByRole('button', { name: 'Copy I-1' })).toBeTruthy();
    expect(within(screen.getByTestId('why-decision')).getByText('None.')).toBeTruthy();
  });
  it('the end note shows small and muted under the idea, not inline', () => {
    show('#/ideas');
    const notes = within(screen.getByTestId('why-none')).getAllByTestId('idea-note');
    expect(notes.map((n) => [n.textContent, n.className])).toEqual([['2026-11-01', 'muted idea-note'], ['2026-11-02', 'muted idea-note']]);
  });
  it('#/ideas/<group> opens that group (Maybe never unfolds)', () => {
    expect(parseHash('#/ideas/never').route).toEqual({ page: 'ideas', group: 'never' });
    expect(parseHash('#/ideas/bogus').route).toEqual({ page: 'ideas' });
    show('#/ideas/never');
    expect((screen.getByTestId('why-never') as HTMLDetailsElement).open).toBe(true);
  });
});

describe('tab title', () => {
  it('names what is open', () => {
    expect(titleOf({ page: 'board' })).toBe('backlogkit · Home');
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

describe('one-click moves (BL-11)', () => {
  const owner = (over: Partial<Owner> = {}) => {
    const moves: MoveRequest[] = [];
    const o: Owner = { canMove: true, unlocked: true, move: async (r) => (moves.push(r), null), unlock: async () => null, lock: () => {}, ...over };
    return { o, moves };
  };
  const showAs = (o: Owner, hash: string) => {
    const { route, q } = parseHash(hash);
    return render(
      <OwnerContext.Provider value={o}>
        <View data={data} route={route} q={q} go={() => {}} now={NOW} />
      </OwnerContext.Provider>,
    );
  };

  it('shows no move buttons unless the owner unlocked them (and never by default)', () => {
    show('#/');
    show('#/ideas');
    expect(screen.queryAllByTestId('move')).toEqual([]);
    cleanup();
    showAs(owner({ unlocked: false }).o, '#/ideas');
    expect(screen.queryAllByTestId('move')).toEqual([]);
  });

  it('home: "Give OK" on each Waiting item only, sending a Held → Ready move without opening the row', async () => {
    const { o, moves } = owner();
    showAs(o, '#/');
    expect(within(lane('next')).queryAllByTestId('move')).toEqual([]);
    expect(within(lane('stuck')).queryAllByTestId('move')).toEqual([]); // OT-11 is blocked: Stuck, no Give OK
    const buttons = within(lane('waiting')).getAllByTestId('move');
    expect(buttons.map((b) => b.textContent)).toEqual(['Give OK']); // DM-3
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(moves).toEqual([{ action: 'ready', repo: 'demo', id: 'DM-3' }]));
    expect(buttons[0]!.closest('details')!.open).toBe(false);
  });

  it('Ideas page: "Plan it" on repo ideas; an unassigned idea needs a repo picked first', async () => {
    const { o, moves } = owner();
    showAs(o, '#/ideas');
    const demoIdeas = within(screen.getByTestId('why-none')).getAllByTestId('move');
    expect(demoIdeas.map((b) => b.textContent)).toEqual(['Plan it', 'Plan it']);
    fireEvent.click(demoIdeas[1]!);
    await waitFor(() => expect(moves).toEqual([{ action: 'idea', repo: 'demo', id: 'I-2' }]));

    const un = screen.getByTestId('why-never');
    const btn = within(un).getByTestId('move') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const pick = within(un).getByTestId('move-to') as HTMLSelectElement;
    expect([...pick.options].map((x) => x.value)).toEqual(['', 'demo', 'other']); // repos with a FEATURE_BACKLOG.md
    fireEvent.change(pick, { target: { value: 'other' } });
    fireEvent.click(btn);
    await waitFor(() => expect(moves[1]).toEqual({ action: 'idea', repo: 'other', id: 'U-1', from: 'unassigned' }));
  });

  it('Ideas page: the reason dropdown (owner only) sends the right request (BL-17)', async () => {
    showAs(owner({ unlocked: false }).o, '#/ideas');
    expect(screen.queryAllByTestId('reason')).toEqual([]);
    cleanup();
    const { o, moves } = owner();
    showAs(o, '#/ideas');
    const pick = screen.getByLabelText('Reason for I-2') as HTMLSelectElement;
    expect(pick.value).toBe('none');
    expect([...pick.options].map((x) => x.textContent)).toEqual(['Needs your decision', 'Waiting on something', 'Too big, needs splitting', 'Not important yet', 'No reason yet', 'Maybe never']);
    fireEvent.change(pick, { target: { value: 'too-big' } });
    await waitFor(() => expect(moves).toEqual([{ action: 'reason', repo: 'demo', id: 'I-2', why: 'too-big' }]));
    const un = screen.getByLabelText('Reason for U-1') as HTMLSelectElement;
    expect(un.value).toBe('never');
    fireEvent.change(un, { target: { value: 'none' } });
    await waitFor(() => expect(moves[1]).toEqual({ action: 'reason', repo: '', id: 'U-1', why: 'none', from: 'unassigned' }));
  });

  it("shows the server's reason next to the button when a move fails", async () => {
    showAs(owner({ move: async () => 'DM-3 is not under Held (moved already?)' }).o, '#/');
    fireEvent.click(within(lane('waiting')).getAllByTestId('move')[0]!);
    expect(await screen.findByTestId('move-error')).toHaveProperty('textContent', 'DM-3 is not under Held (moved already?)');
  });

  it('Stuck cards show the question in red with its date; Answer only when unlocked (BL-16)', () => {
    showAs(owner({ unlocked: false }).o, '#/');
    const notes = within(lane('stuck')).getAllByTestId('blocked-note');
    expect(notes.map((n) => n.textContent)).toEqual(["waiting for the owner's colour choice.", 'needs a key.']);
    expect(within(lane('stuck')).getAllByTestId('answer-locked').map((n) => n.textContent)).toEqual(['Unlock as owner to answer', 'Unlock as owner to answer']);
    expect(within(lane('stuck')).queryAllByTestId('answer')).toEqual([]);
    cleanup();
    show('#/'); // moves off: neither
    expect(screen.queryAllByTestId('answer-locked')).toEqual([]);
    expect(screen.queryAllByTestId('answer')).toEqual([]);
    expect(screen.getAllByTestId('blocked-note')).toHaveLength(2);
  });

  it('Answer: empty Save is refused inline; Save sends the answer; Cancel closes (BL-16)', async () => {
    const { o, moves } = owner();
    showAs(o, '#/');
    const card = within(lane('stuck')).getAllByTestId('stuck-card')[0]!;
    fireEvent.click(within(card).getByTestId('answer'));
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getByTestId('answer-error').textContent).toBe('Type an answer first.');
    expect(moves).toEqual([]);
    fireEvent.change(within(card).getByLabelText('Answer for DM-2'), { target: { value: 'Blue.' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(moves).toEqual([{ action: 'answer', repo: 'demo', id: 'DM-2', answer: 'Blue.' }]));
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(within(card).queryByTestId('answer-form')).toBeNull();
  });

  it('Answer: a refusal from the server shows next to the box', async () => {
    showAs(owner({ move: async () => 'Already answered — reload' }).o, '#/');
    const card = within(lane('stuck')).getAllByTestId('stuck-card')[0]!;
    fireEvent.click(within(card).getByTestId('answer'));
    fireEvent.change(within(card).getByLabelText('Answer for DM-2'), { target: { value: 'x' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect((await within(card).findByTestId('answer-error')).textContent).toBe('Already answered — reload');
  });

  it("applyMove puts the answer's lists into the page data", () => {
    const planned = [{ name: 'Ready', kind: 'ready' as const, items: [] }];
    const next = applyMove(data, { updates: [{ repo: 'demo', planned, ideas: [], counts: { ready: 0, held: 0, planned: 0, blocked: 0, ideas: 0 } }], unassigned: [] });
    expect(next.projects.find((p) => p.repo === 'demo')!.planned).toBe(planned);
    expect(next.projects.find((p) => p.repo === 'other')).toBe(data.projects.find((p) => p.repo === 'other'));
    expect(next.unassigned.ideas).toEqual([]);
  });
});
