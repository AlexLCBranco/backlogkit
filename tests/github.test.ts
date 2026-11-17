import { describe, expect, it } from 'vitest';
import { loadAll } from '../lib/github.mjs';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from './fixtures';

const entries = [
  { repo: 'demo', description: 'The demo app', url: 'https://demo.vercel.app', status: 'active', devices: ['desktop'] },
  { repo: 'paused-one', description: null, url: null, status: 'paused', devices: null },
  { repo: 'ghost', description: 'Listed but gone', url: null, status: 'retired', devices: ['desktop'] },
];
const repos = [{ name: 'demo' }, { name: 'paused-one', private: true }, { name: 'stray' }, { name: 'empty' }];
const files = {
  demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS },
  'paused-one': { 'IDEAS.md': '- I-1 — x\n' },
  stray: { 'BUILT.md': '## 2026-11-01\n- thing (v0.1.0)\n' },
};
const load = (opts: Parameters<typeof mockGithub>[0], token = 'test-token-abc') => {
  const m = mockGithub(opts);
  return loadAll({ token, fetchImpl: m.fetchImpl }).then((d) => ({ d, calls: m.calls }));
};

describe('loadAll: projects.json merged with GitHub', () => {
  it('merges per repo, keeps nulls as nulls, sorts active → paused → retired → no status → no files', async () => {
    const { d } = await load({ repos, files, projectsJson: projectsJson(entries) });
    expect(d.projects.map((p) => p.repo)).toEqual(['demo', 'paused-one', 'ghost', 'stray', 'empty']);
    expect(d.projects[0]).toMatchObject({ description: 'The demo app', status: 'active', latestVersion: '1.3.0', latestBuiltDate: '2026-11-17', counts: { ready: 2, held: 1, planned: 3, blocked: 1, ideas: 2 } });
    expect(d.projects[0]!.github).toMatchObject({ url: 'https://github.com/AlexLCBranco/demo', private: false });
    expect(d.projects[1]).toMatchObject({ description: null, url: null, devices: null, github: { private: true } });
  });
  it('a repo on GitHub but not in projects.json still shows, with nulls', async () => {
    const { d } = await load({ repos, files, projectsJson: projectsJson(entries) });
    expect(d.projects.find((p) => p.repo === 'stray')).toMatchObject({ inProjectsJson: false, description: null, status: null, url: null, devices: null, latestVersion: '0.1.0', warning: null, error: null });
  });
  it('an entry whose repo does not exist shows a warning', async () => {
    const { d } = await load({ repos, files, projectsJson: projectsJson(entries) });
    expect(d.projects.find((p) => p.repo === 'ghost')!.warning).toMatch(/No repo "ghost"/);
  });
  it('repos without any of the three files are flagged noFiles', async () => {
    const { d } = await load({ repos, files, projectsJson: projectsJson(entries) });
    expect(d.projects.filter((p) => p.noFiles).map((p) => p.repo)).toEqual(['empty']);
  });
  it('an unreadable repo carries its reason', async () => {
    const { d } = await load({ repos, files, fails: { demo: 403 }, projectsJson: projectsJson(entries) });
    expect(d.projects.find((p) => p.repo === 'demo')!.error).toMatch(/Not read: demo\/\w+\.md: HTTP 403 \(no access or rate limit\)/);
  });
  it('a failed repo list or projects.json is reported, not hidden', async () => {
    const { d } = await load({ repos, files, fails: { list: 500, projects: 401 } });
    expect(d.problems).toEqual(['projects.json not read: backlogkit/projects.json: HTTP 401 (token rejected)', 'GitHub repo list not read: repo list: HTTP 500']);
  });
  it('without a token: public list and raw files; projects.json entries not on GitHub are unread, not missing', async () => {
    const { d, calls } = await load({ repos: [{ name: 'demo' }], files, projectsJson: projectsJson(entries) }, '');
    expect(d.tokenSet).toBe(false);
    expect(calls.some((c) => c.url.includes('/users/AlexLCBranco/repos'))).toBe(true);
    expect(calls.filter((c) => c.url.includes('/contents/'))).toEqual([]);
    expect(calls.every((c) => !('Authorization' in c.headers))).toBe(true);
    const paused = d.projects.find((p) => p.repo === 'paused-one')!;
    expect(paused.error).toMatch(/^Unread: .*no token/);
    expect(paused.warning).toBeNull();
    expect(d.projects.find((p) => p.repo === 'demo')!.counts.planned).toBe(3);
  });
  it('the token goes only into Authorization headers of GitHub API requests', async () => {
    const { calls } = await load({ repos, files, projectsJson: projectsJson(entries) }, 'SECRET-123');
    expect(calls.length).toBeGreaterThan(5);
    for (const c of calls) {
      expect(c.url).not.toContain('SECRET-123');
      expect(c.url).toMatch(/^https:\/\/api\.github\.com\//);
      expect(c.headers.Authorization).toBe('Bearer SECRET-123');
    }
  });
});

describe('dates for sorting (BL-4)', () => {
  const dated = [
    { name: 'demo', created_at: '2025-05-05T00:00:00Z', backlog_changed: '2026-11-16T08:00:00Z' },
    { name: 'stray' },
    { name: 'empty' },
  ];
  it('backlog-changed date from the last commit touching FEATURE_BACKLOG.md, creation date from the repo list', async () => {
    const { d, calls } = await load({ repos: dated, files });
    const demo = d.projects.find((p) => p.repo === 'demo')!;
    expect(demo.backlogChangedAt).toBe('2026-11-16T08:00:00Z');
    expect(demo.github!.createdAt).toBe('2025-05-05T00:00:00Z');
    expect(calls.filter((c) => c.url.includes('/commits?'))).toHaveLength(1); // only repos with a backlog ask
    expect(calls.find((c) => c.url.includes('/commits?'))!.url).toContain('path=FEATURE_BACKLOG.md&per_page=1&sha=main');
    expect(d.projects.find((p) => p.repo === 'stray')!.backlogChangedAt).toBeNull();
  });
  it('a failed date request leaves a dash and a notice, not a broken card', async () => {
    const { d } = await load({ repos: dated, files, fails: { 'commits:demo': 403 }, projectsJson: projectsJson([]) });
    const demo = d.projects.find((p) => p.repo === 'demo')!;
    expect(demo.backlogChangedAt).toBeNull();
    expect(demo.error).toBeNull();
    expect(demo.counts.planned).toBe(3);
    expect(d.problems).toEqual(['Backlog-changed dates not read (they show as a dash): demo (demo commits: HTTP 403 (no access or rate limit))']);
  });
});
