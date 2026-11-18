// @vitest-environment jsdom
// The pages, rendered from mocked GitHub data (the same loadAll the function runs).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadAll } from '../lib/github.mjs';
import { View, parseHash, titleOf } from '../src/App';
import { search } from '../src/search';
import type { Data } from '../src/types';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from './fixtures';

let data: Data;
beforeAll(async () => {
  const { fetchImpl } = mockGithub({
    repos: [{ name: 'demo' }, { name: 'other' }, { name: 'broken', private: true }, { name: 'bare' }],
    files: { demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS }, other: { 'FEATURE_BACKLOG.md': '## Ready\n\n### OT-10 — Other ten\nmentions DM-1 in passing\n', 'BUILT.md': '## 2026-11-17\n- OT-1 — Other built (v2.0.0)\n' } },
    fails: { broken: 403 },
    projectsJson: projectsJson([
      { repo: 'demo', description: 'Demo app', url: 'https://demo.vercel.app', status: 'active', devices: ['desktop'] },
      { repo: 'other', description: null, url: null, status: 'paused', devices: null },
      { repo: 'broken', description: 'Locked away', url: null, status: 'active', devices: ['desktop'] },
    ]),
  });
  data = (await loadAll({ token: 'tok', fetchImpl })) as Data;
});
afterEach(cleanup);

const show = (hash: string) => {
  const { route, q } = parseHash(hash);
  return render(<View data={data} route={route} q={q} go={() => {}} />);
};

describe('home', () => {
  it('groups cards active → paused → no status, repos without lists at the bottom', () => {
    show('#/');
    const groups = screen.getAllByTestId(/^group-/).map((g) => g.dataset.testid);
    expect(groups).toEqual(['group-active', 'group-paused', 'group-nofiles']);
    expect(within(screen.getByTestId('group-nofiles')).getByTestId('card-bare')).toBeTruthy();
  });
  it('a card shows counts, version, and dashes for empty fields', () => {
    show('#/');
    const demo = screen.getByTestId('card-demo');
    expect(demo.textContent).toContain('v1.3.0');
    expect(demo.textContent).toContain('2026-11-17');
    expect(within(demo).getByTestId('counts').textContent).toBe('Planned 3 (Ready 2 / Held 1) · Blocked 1 · Ideas 2');
    const other = screen.getByTestId('card-other');
    expect(other.querySelector('.desc')!.textContent).toBe('—');
    expect(other.textContent).toContain('Devices—');
    expect(other.textContent).toContain('Live site—');
  });
  it('an unreadable repo shows its reason', () => {
    show('#/');
    expect(within(screen.getByTestId('card-broken')).getByRole('alert').textContent).toMatch(/Not read: .*HTTP 403/);
  });
});

describe('project page', () => {
  it('shows Planned with its sections and Built newest day first, Internal left out, Ideas folded', () => {
    show('#/p/demo');
    const planned = screen.getByTestId('planned');
    expect([...planned.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Ready', 'Held (needs the owner\'s "go")']);
    const blocked = within(planned).getAllByTestId('planned-item').filter((i) => i.textContent!.includes('Blocked'));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.textContent).toContain('DM-2');
    expect(within(planned).getAllByTestId('planned-item')[0]!.querySelector('.body')!.textContent).toContain('- a bullet');
    const built = screen.getByTestId('built');
    expect(within(built).getAllByTestId('built-day').map((d) => d.querySelector('h4')!.textContent)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
    expect(built.textContent).not.toContain('housekeeping');
    const ideas = screen.getByTestId('ideas') as HTMLDetailsElement;
    expect(ideas.open).toBe(false);
    expect(ideas.textContent).toContain('Dark mode toggle');
  });
});

describe('all repos', () => {
  it('lists planned items by repo and built items by day, newest first', () => {
    show('#/all');
    expect(screen.getByTestId('all-planned').textContent).toMatch(/demo.*DM-1.*other.*OT-10/s);
    const days = screen.getAllByTestId('all-built-day');
    expect(days.map((d) => d.querySelector('h4')!.textContent)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
    expect(days[0]!.textContent).toMatch(/demo.*DM-5.*other.*OT-1/s);
  });
});

describe('search', () => {
  it('an ID matches only that ID', () => {
    expect(search(data.projects, 'DM-1').map((h) => h.id)).toEqual(['DM-1']);
    expect(search(data.projects, 'ot-1').map((h) => h.id)).toEqual(['OT-1']);
  });
  it('text matches titles and full text across repos, every word required', () => {
    expect(search(data.projects, 'thing').map((h) => h.id)).toEqual(['DM-1', 'DM-2', 'DM-3', 'DM-5', 'DM-0', 'I-2']);
    expect(search(data.projects, 'colour choice').map((h) => h.id)).toEqual(['DM-2']);
    expect(search(data.projects, 'passing').map((h) => h.repo)).toEqual(['other']);
    expect(search(data.projects, 'dark mode').map((h) => h.kind)).toEqual(['idea']);
    expect(search(data.projects, '  ')).toEqual([]);
  });
  it('the results page replaces any page while a query is set', () => {
    show('#/p/demo?q=stuck');
    const hits = screen.getAllByTestId('hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.textContent).toMatch(/demo.*Planned.*Ready.*DM-2.*Stuck thing.*Blocked/);
    fireEvent.click(hits[0]!.querySelector('summary')!);
  });
});

describe('tab title', () => {
  it('names what is open', () => {
    expect(titleOf({ page: 'home' })).toBe('backlogkit · Projects');
    expect(titleOf({ page: 'project', repo: 'calendarkit' })).toBe('backlogkit · calendarkit backlog');
    expect(titleOf({ page: 'all' })).toBe('backlogkit · All repos');
    expect(titleOf({ page: 'all' }, '  dark ')).toBe('backlogkit · search “dark”');
  });
});

describe('the token', () => {
  it('is never in the rendered pages', async () => {
    const { fetchImpl } = mockGithub({ repos: [{ name: 'demo' }], files: { demo: { 'BUILT.md': BUILT } }, fails: {}, projectsJson: projectsJson([{ repo: 'demo' }, { repo: 'gone' }]) });
    const d = (await loadAll({ token: 'SECRET-TOKEN-XYZ', fetchImpl })) as Data;
    for (const hash of ['#/', '#/p/demo', '#/all', '#/?q=a']) {
      const { container, unmount } = render(<View data={d} {...parseHash(hash)} go={() => {}} />);
      expect(container.innerHTML).not.toContain('SECRET-TOKEN-XYZ');
      unmount();
    }
  });
});
