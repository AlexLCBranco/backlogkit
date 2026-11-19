// BL-11: /api/move against an in-memory GitHub (repos with commits and a branch head; writes through the Git Data API).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKLOG, BUILT, IDEAS } from './fixtures';

const TOKEN = 'github_pat_WRITE_SECRET_never_leaks';
const PASSWORD = 'correct horse battery staple';

type Tree = Record<string, string>;
function fakeGithub(start: Record<string, Tree>, opts: { archived?: string[]; moveHeadOnce?: string } = {}) {
  let n = 0;
  const commits = new Map<string, { tree: Tree; parent: string | null; message: string }>();
  const trees = new Map<string, Tree>();
  const heads = new Map<string, string>();
  const newSha = () => `sha${++n}`;
  for (const [repo, tree] of Object.entries(start)) {
    const sha = newSha();
    commits.set(sha, { tree, parent: null, message: 'init' });
    heads.set(repo, sha);
  }
  const calls: { method: string; url: string; auth: string }[] = [];
  let moved = false;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, auth: String((init?.headers as Record<string, string>)?.Authorization ?? '') });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    const m = url.match(/^https:\/\/api\.github\.com\/repos\/AlexLCBranco\/([^/?]+)(\/.*)?$/);
    if (!m) return json({ message: 'bad url' }, 500);
    const repo = decodeURIComponent(m[1]!);
    const rest = m[2] ?? '';
    if (!heads.has(repo)) return json({ message: 'Not Found' }, 404);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (rest === '') return json({ default_branch: 'main', archived: !!opts.archived?.includes(repo) });
    if (rest === '/git/ref/heads/main') {
      const sha = heads.get(repo)!;
      if (opts.moveHeadOnce === repo && !moved) {
        // someone else pushes right after this read
        moved = true;
        const other = newSha();
        commits.set(other, { tree: { ...commits.get(sha)!.tree, 'OTHER.md': 'x' }, parent: sha, message: 'other' });
        heads.set(repo, other);
      }
      return json({ object: { sha } });
    }
    const c = rest.match(/^\/contents\/([^?]+)\?ref=(\w+)$/);
    if (c) {
      const text = commits.get(c[2]!)?.tree[c[1]!];
      return text === undefined ? new Response('Not Found', { status: 404 }) : new Response(text);
    }
    const g = rest.match(/^\/git\/commits\/(\w+)$/);
    if (g && method === 'GET') return json({ sha: g[1], tree: { sha: `tree-of-${g[1]}` } });
    if (rest === '/git/trees' && method === 'POST') {
      const base = commits.get(String(body.base_tree).replace('tree-of-', ''))!.tree;
      const tree = { ...base };
      for (const e of body.tree) tree[e.path] = e.content;
      const sha = newSha();
      trees.set(sha, tree);
      return json({ sha }, 201);
    }
    if (rest === '/git/commits' && method === 'POST') {
      const sha = newSha();
      commits.set(sha, { tree: trees.get(body.tree)!, parent: body.parents[0], message: body.message });
      return json({ sha }, 201);
    }
    if (rest === '/git/refs/heads/main' && method === 'PATCH') {
      if (opts.archived?.includes(repo)) return json({}, 403);
      const parent = commits.get(body.sha)!.parent;
      if (body.force || parent !== heads.get(repo)) return json({ message: 'Update is not a fast forward' }, 422);
      heads.set(repo, body.sha);
      return json({ object: { sha: body.sha } });
    }
    return json({ message: 'unexpected' }, 500);
  };
  const file = (repo: string, path: string) => commits.get(heads.get(repo)!)!.tree[path];
  const log = (repo: string) => {
    const out: string[] = [];
    for (let s: string | null = heads.get(repo)!; s; s = commits.get(s)!.parent) out.push(commits.get(s)!.message);
    return out;
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls, file, log };
}

const demo = () => ({ 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS });
const post = (body: object, password: string | null = PASSWORD) =>
  new Request('http://x/api/move', { method: 'POST', headers: { 'content-type': 'application/json', ...(password ? { 'x-owner-password': password } : {}) }, body: JSON.stringify(body) });

describe('/api/move (BL-11)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GITHUB_WRITE_TOKEN', TOKEN);
    vi.stubEnv('OWNER_PASSWORD', PASSWORD);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off (503) unless both the password and the write token are set', async () => {
    vi.stubEnv('GITHUB_WRITE_TOKEN', '');
    const { POST, movesEnabled } = await import('../api/move');
    expect(movesEnabled()).toBe(false);
    expect((await POST(post({ action: 'check' }))).status).toBe(503);
  });

  it('refuses a missing or wrong password, and writes nothing', async () => {
    const gh = fakeGithub({ demo: demo() });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    expect((await POST(post({ action: 'ready', repo: 'demo', id: 'DM-3' }, null))).status).toBe(401);
    expect((await POST(post({ action: 'ready', repo: 'demo', id: 'DM-3' }, 'wrong'))).status).toBe(401);
    expect(gh.calls).toEqual([]);
    expect((await POST(post({ action: 'check' }))).status).toBe(200);
  });

  it('Next → Now: one commit moving the Held item to Ready, with the write token, answering the new lists', async () => {
    const gh = fakeGithub({ demo: demo() });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    const r = await POST(post({ action: 'ready', repo: 'demo', id: 'DM-3' }));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.updates[0].planned.find((s: { kind: string }) => s.kind === 'ready').items.map((i: { id: string }) => i.id)).toEqual(['DM-1', 'DM-2', 'DM-3']);
    expect(body.updates[0].counts).toMatchObject({ ready: 3, held: 0, ideas: 2 });
    expect(gh.file('demo', 'FEATURE_BACKLOG.md')).toMatch(/### DM-3 — Later thing\nHeld text\.\n\n## Held/);
    expect(gh.file('demo', 'BUILT.md')).toBe(BUILT); // never into Built
    expect(gh.log('demo')).toEqual(['Backlog: DM-3 Held → Ready (backlogkit one-click move)', 'init']);
    expect(gh.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('idea → Next: idea cut and added to Held in one commit, with the next free ID', async () => {
    const gh = fakeGithub({ demo: demo() });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    const body = await (await POST(post({ action: 'idea', repo: 'demo', id: 'I-1' }))).json();
    expect(body.newId).toBe('DM-6');
    expect(gh.file('demo', 'IDEAS.md')).not.toContain('I-1');
    expect(gh.file('demo', 'FEATURE_BACKLOG.md')).toMatch(/### DM-6 — Dark mode toggle\nFrom I-1 \(2026-11-01\)\n$/);
    expect(gh.log('demo')).toHaveLength(2);
    expect(body.updates[0].ideas.map((i: { id: string }) => i.id)).toEqual(['I-2']);
  });

  it('unassigned idea → a repo: added there first, then cut from UNASSIGNED_IDEAS.md here', async () => {
    const gh = fakeGithub({ demo: demo(), backlogkit: { 'UNASSIGNED_IDEAS.md': '# U\n\n- U-1 — Orphan gadget (2026-11-18)\n- U-2 — Other\n' } });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    const body = await (await POST(post({ action: 'idea', repo: 'demo', id: 'U-1', from: 'unassigned' }))).json();
    expect(body.newId).toBe('DM-6');
    expect(gh.file('demo', 'FEATURE_BACKLOG.md')).toContain('### DM-6 — Orphan gadget\nFrom U-1 (2026-11-18)\n');
    expect(gh.file('backlogkit', 'UNASSIGNED_IDEAS.md')).toBe('# U\n\n- U-2 — Other\n');
    expect(body.unassigned.map((i: { id: string }) => i.id)).toEqual(['U-2']);
  });

  it('starts again from a fresh read when the branch moved meanwhile (never forces)', async () => {
    const gh = fakeGithub({ demo: demo() }, { moveHeadOnce: 'demo' });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    expect((await POST(post({ action: 'ready', repo: 'demo', id: 'DM-3' }))).status).toBe(200);
    expect(gh.log('demo')).toEqual(['Backlog: DM-3 Held → Ready (backlogkit one-click move)', 'other', 'init']);
    expect(gh.file('demo', 'OTHER.md')).toBe('x'); // the other push is kept
  });

  it('answers plain reasons without the token: already moved, unknown repo, archived repo', async () => {
    const gh = fakeGithub({ demo: demo(), old: demo() }, { archived: ['old'] });
    vi.stubGlobal('fetch', gh.fetchImpl);
    const { POST } = await import('../api/move');
    const a = await POST(post({ action: 'ready', repo: 'demo', id: 'DM-1' }));
    expect(a.status).toBe(409);
    expect((await a.json()).error).toMatch(/DM-1 is not under Held/);
    const b = await (await POST(post({ action: 'ready', repo: 'nope', id: 'DM-3' }))).text();
    expect(b).toMatch(/404/);
    const c = await (await POST(post({ action: 'ready', repo: 'old', id: 'DM-3' }))).text();
    expect(c).toMatch(/archived/);
    expect((await POST(post({ action: 'ready', repo: '../x', id: 'DM-3' }))).status).toBe(409);
    for (const t of [b, c]) expect(t).not.toContain(TOKEN);
    expect(gh.log('demo')).toEqual(['init']);
  });

  it('/api/projects says whether moves are on', async () => {
    const { mockGithub, projectsJson } = await import('./fixtures');
    vi.stubGlobal('fetch', mockGithub({ repos: [], files: {}, projectsJson: projectsJson([]) }).fetchImpl);
    const { GET } = await import('../api/projects');
    expect((await (await GET()).json()).canMove).toBe(true);
  });
});
