// The function: the token never appears in what it sends, even inside an error message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKLOG, mockGithub, projectsJson } from './fixtures';

const TOKEN = 'github_pat_TESTSECRET_never_leaks';

describe('/api/projects', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers the projects, cacheable for about a minute, without the token', async () => {
    const { fetchImpl } = mockGithub({ repos: [{ name: 'demo', private: true }], files: { demo: { 'FEATURE_BACKLOG.md': BACKLOG } }, projectsJson: projectsJson([{ repo: 'demo' }]) });
    vi.stubGlobal('fetch', fetchImpl);
    const { GET } = await import('../api/projects');
    const r = await GET();
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('s-maxage=60');
    expect(JSON.parse(body).tokenSet).toBe(true);
    expect(JSON.parse(body).projects[0].counts.planned).toBe(3);
    expect(body).not.toContain(TOKEN);
  });

  it('scrubs the token out of error text that echoes it', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw new Error(`boom with ${TOKEN}`);
    }) as typeof fetch);
    const { GET } = await import('../api/projects');
    const body = await (await GET()).text();
    expect(body).toContain('boom with ***');
    expect(body).not.toContain(TOKEN);
  });

  it('serves a second visit within a minute from its cache', async () => {
    const { fetchImpl, calls } = mockGithub({ repos: [], files: {}, projectsJson: projectsJson([]) });
    vi.stubGlobal('fetch', fetchImpl);
    const { GET } = await import('../api/projects');
    await GET();
    const n = calls.length;
    await GET();
    expect(calls.length).toBe(n);
  });
});
