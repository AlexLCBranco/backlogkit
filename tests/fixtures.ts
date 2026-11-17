// A mocked GitHub for the tests: repos, files and failures by URL. Records every request (with its headers).

export const BACKLOG = `# Feature backlog — demo

Planned work only.

## Ready

### DM-1 — First thing
Line one of the spec.
- a bullet
  continued

### DM-2 — Stuck thing
Needs a decision.
Blocked: waiting for the owner's colour choice.

## Held (needs the owner's "go")

### DM-3 — Later thing
Held text.
`;

export const BUILT = `# Built — demo

Shipped work only.

## 2026-11-15
- DM-0 — Older thing (v1.1.0)

## 2026-11-17
- DM-5 — Newest thing (v1.3.0)
  What the owner sees now.
- A fix without ID (v1.2.1)
### Internal
- test: secret housekeeping line

## 2026-11-16
- v1.2.0: old style line
`;

export const IDEAS = `# Ideas — demo

Never built from directly.

- I-1 — Dark mode toggle (2026-11-01)
- I-2 — Something long
  that wraps (2026-11-02)
`;

// backlog_changed: the date the commits API answers for FEATURE_BACKLOG.md (none → an empty list).
export interface Repo { name: string; private?: boolean; pushed_at?: string; created_at?: string; default_branch?: string; backlog_changed?: string }
export type Files = Record<string, Record<string, string>>; // repo → path → text
export type Fails = Record<string, number>; // repo (or "list", "projects", "commits:<repo>") → HTTP status

export function mockGithub({ repos, files, fails = {}, projectsJson }: { repos: Repo[]; files: Files; fails?: Fails; projectsJson?: string }) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const text = (body: string, status = 200) => new Response(body, { status });
    if (/\/(user|users\/[^/]+)\/repos/.test(url)) {
      if (fails.list) return text('{}', fails.list);
      const page = Number(new URL(url).searchParams.get('page') ?? 1);
      const list =
        page === 1
          ? repos.map((r) => ({ name: r.name, html_url: `https://github.com/AlexLCBranco/${r.name}`, private: !!r.private, pushed_at: r.pushed_at ?? '2026-11-17T10:00:00Z', created_at: r.created_at ?? '2026-01-01T00:00:00Z', default_branch: r.default_branch ?? 'main', owner: { login: 'AlexLCBranco' } }))
          : [];
      return text(JSON.stringify(list));
    }
    const c = url.match(/api\.github\.com\/repos\/AlexLCBranco\/([^/]+)\/commits\?(.*)$/);
    if (c) {
      const repo = c[1]!;
      if (fails[`commits:${repo}`]) return text('{}', fails[`commits:${repo}`]);
      if (new URLSearchParams(c[2]).get('path') !== 'FEATURE_BACKLOG.md') return text('unexpected path', 500);
      const date = repos.find((r) => r.name === repo)?.backlog_changed;
      return text(JSON.stringify(date ? [{ commit: { committer: { date } } }] : []));
    }
    const m = url.match(/api\.github\.com\/repos\/AlexLCBranco\/([^/]+)\/contents\/([^?]+)/) ?? url.match(/raw\.githubusercontent\.com\/AlexLCBranco\/([^/]+)\/[^/]+\/(.+)$/);
    if (m) {
      const repo = m[1]!;
      const path = m[2]!;
      if (repo === 'backlogkit' && path === 'projects.json') {
        if (fails.projects) return text('', fails.projects);
        return projectsJson === undefined ? text('', 404) : text(projectsJson);
      }
      if (fails[repo]) return text('', fails[repo]);
      const body = files[repo]?.[path];
      return body === undefined ? text('Not Found', 404) : text(body);
    }
    return text('unexpected url', 500);
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

export const projectsJson = (projects: object[]) => JSON.stringify({ projects });
