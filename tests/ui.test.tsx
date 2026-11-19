// @vitest-environment jsdom
// The pages, rendered from mocked GitHub data (the same loadAll the function runs).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OwnerContext, applyMove, type MoveRequest, type Owner } from '../src/owner';
import { loadAll } from '../lib/github.mjs';
import { View, parseHash, titleOf, cardTooltip } from '../src/App';
import { FILTER_STORAGE_KEY, LANES, boardIdeas, boardItems, builtCutoff, builtGroups, ideaMatches, laneCounts, laneOf, matches } from '../src/board';
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
const lane = (key: string) => screen.getByTestId(`lane-${key}`);
const lines = (key: string) => within(lane(key)).queryAllByTestId('board-item').map((i) => i.querySelector('summary')!.textContent);
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
    expect(lines('stuck')).toEqual(['demoDM-2Stuck thing', 'otherOT-11Other held']);
    expect(lines('next')).toEqual(['demoDM-1First thing', 'otherOT-10Other ten']);
    expect(lines('waiting')).toEqual(['demoDM-3Later thing']);
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
    expect(within(lane('done')).getByText('Nothing built in the last 7 days.')).toBeTruthy();
    expect(lane('stuck').classList.contains('is-empty')).toBe(true);
    expect(lane('waiting').classList.contains('is-empty')).toBe(false);
  });
  it('Ideas is one row linking to the Ideas page; no idea is in another lane', () => {
    show('#/');
    expect(within(lane('ideas')).getByRole('link', { name: '3 ideas' }).getAttribute('href')).toBe('#/ideas');
    const text = screen.getAllByTestId('board-item').map((i) => i.textContent).join('\n');
    expect(text).not.toMatch(/\b[IU]-\d+/);
  });
  it('Done is the last 7 days, open, grouped by repo, with a link to everything built', () => {
    show('#/');
    expect(screen.getAllByTestId('built-group').map((g) => g.dataset.repo)).toEqual(['demo', 'other']);
    expect(lines('done')).toEqual(['demoDM-5Newest thing (v1.3.0)', 'demoA fix without ID (v1.2.1)', 'demov1.2.0: old style line', 'demoDM-0Older thing (v1.1.0)', 'otherOT-1Other built (v2.0.0)']);
    expect(within(lane('done')).getByRole('link', { name: 'Everything built' }).getAttribute('href')).toBe('#/built');
    cleanup();
    show('#/', new Date(2026, 10, 22, 12)); // 7 days: 2026-11-16 … 2026-11-22
    expect(lines('done')).toHaveLength(4);
    expect(builtCutoff(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-16');
    expect(builtCutoff(new Date(2026, 11, 3))).toBe('2026-11-27');
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
    expect(lines('next')).toEqual(['otherOT-10Other ten']);
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
    expect(lines('done')).toEqual(['demoDM-0Older thing (v1.1.0)']);
    expect(heads()).toEqual(['Stuck – needs you 0', 'Will be built next 0', 'Waiting for your OK 0', 'Ideas 0', 'Done 1']);
    cleanup();
    show('#/ideas?q=orphan');
    expect(within(lane('ideas')).getAllByTestId('idea').map((i) => i.textContent)).toEqual(['Unassigned U-1 Orphan gadget (2026-11-18)']);
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
  it('an empty Unassigned group says so', () => {
    render(<View data={{ ...data, unassigned: { file: true, ideas: [] } }} route={{ page: 'ideas' }} q="" go={() => {}} />);
    expect(screen.getByTestId('ideas-unassigned').textContent).toContain('No unassigned ideas.');
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
    const demoIdeas = within(screen.getByTestId('ideas-demo')).getAllByTestId('move');
    expect(demoIdeas.map((b) => b.textContent)).toEqual(['Plan it', 'Plan it']);
    fireEvent.click(demoIdeas[1]!);
    await waitFor(() => expect(moves).toEqual([{ action: 'idea', repo: 'demo', id: 'I-2' }]));

    const un = screen.getByTestId('ideas-unassigned');
    const btn = within(un).getByTestId('move') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const pick = within(un).getByTestId('move-to') as HTMLSelectElement;
    expect([...pick.options].map((x) => x.value)).toEqual(['', 'demo', 'other']); // repos with a FEATURE_BACKLOG.md
    fireEvent.change(pick, { target: { value: 'other' } });
    fireEvent.click(btn);
    await waitFor(() => expect(moves[1]).toEqual({ action: 'idea', repo: 'other', id: 'U-1', from: 'unassigned' }));
  });

  it("shows the server's reason next to the button when a move fails", async () => {
    showAs(owner({ move: async () => 'DM-3 is not under Held (moved already?)' }).o, '#/');
    fireEvent.click(within(lane('waiting')).getAllByTestId('move')[0]!);
    expect(await screen.findByTestId('move-error')).toHaveProperty('textContent', 'DM-3 is not under Held (moved already?)');
  });

  it("applyMove puts the answer's lists into the page data", () => {
    const planned = [{ name: 'Ready', kind: 'ready' as const, items: [] }];
    const next = applyMove(data, { updates: [{ repo: 'demo', planned, ideas: [], counts: { ready: 0, held: 0, planned: 0, blocked: 0, ideas: 0 } }], unassigned: [] });
    expect(next.projects.find((p) => p.repo === 'demo')!.planned).toBe(planned);
    expect(next.projects.find((p) => p.repo === 'other')).toBe(data.projects.find((p) => p.repo === 'other'));
    expect(next.unassigned.ideas).toEqual([]);
  });
});
