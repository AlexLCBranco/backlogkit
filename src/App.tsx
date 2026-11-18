// The site: Projects (home, one card each), a project's page (Planned | Built, Ideas folded), All repos, and search
// from the top bar on every page. Routes live in the hash: #/, #/p/<repo>, #/all, plus ?q=<search>.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Data, Project, Section, BuiltDay } from './types';
import { search, type Hit } from './search';
import { SiteVersion } from './SiteVersion';
import { BUILD_INFO } from './build-info';
import { CopyButton } from './CopyButton';
import { SORT_OPTIONS, loadSort, saveSort, sortProjects, type SortKey } from './sort';
import { backlogMarkdown, itemMarkdown } from '../lib/lists.mjs';

export type Route = { page: 'home' } | { page: 'project'; repo: string } | { page: 'all' };

export function parseHash(hash: string): { route: Route; q: string } {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query).get('q') ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return { route: { page: 'project', repo: decodeURIComponent(parts[1]) }, q };
  if (parts[0] === 'all') return { route: { page: 'all' }, q };
  return { route: { page: 'home' }, q };
}

export const hrefOf = (route: Route) => (route.page === 'project' ? `#/p/${encodeURIComponent(route.repo)}` : route.page === 'all' ? '#/all' : '#/');

/** A field nobody filled in shows as a dash, never a guess. */
const DASH = '—';
const dash = (v: ReactNode | null | undefined) => (v === null || v === undefined || v === '' ? DASH : v);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

const STATUS_GROUPS: { key: string; label: string; test: (p: Project) => boolean }[] = [
  { key: 'active', label: 'Active', test: (p) => !p.noFiles && p.status === 'active' },
  { key: 'paused', label: 'Paused', test: (p) => !p.noFiles && p.status === 'paused' },
  { key: 'retired', label: 'Retired', test: (p) => !p.noFiles && p.status === 'retired' },
  { key: 'none', label: 'No status', test: (p) => !p.noFiles && !['active', 'paused', 'retired'].includes(p.status ?? '') },
  { key: 'nofiles', label: 'No backlog files', test: (p) => p.noFiles },
];

function ExtLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{DASH}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

export function Card({ p, onOpen }: { p: Project; onOpen?: () => void }) {
  const c = p.counts;
  return (
    <article className={`card${onOpen ? ' clickable' : ''}`} data-testid={`card-${p.repo}`} onClick={onOpen}>
      <header>
        <h3>{onOpen ? <a href={hrefOf({ page: 'project', repo: p.repo })} onClick={(e) => e.stopPropagation()}>{p.repo}</a> : p.repo}</h3>
        <span className={`status status-${p.status ?? 'none'}`}>{dash(p.status)}</span>
      </header>
      <p className="desc">{dash(p.description)}</p>
      {p.warning && <p className="warning" role="alert">⚠ {p.warning}</p>}
      {p.error && <p className="error" role="alert">✕ {p.error}</p>}
      <dl>
        <dt>Live site</dt>
        <dd><ExtLink href={p.url}>{p.url?.replace(/^https?:\/\//, '')}</ExtLink></dd>
        <dt>Repo</dt>
        <dd>
          <ExtLink href={p.github?.url ?? null}>{p.repo}</ExtLink>
          {p.github && <span className="muted"> · {p.github.private ? 'private' : 'public'}{p.github.archived ? ' · archived' : ''}</span>}
        </dd>
        <dt>Devices</dt>
        <dd>{dash(p.devices?.join(', '))}</dd>
        <dt>Last push</dt>
        <dd>{dash(day(p.github?.pushedAt ?? null))}</dd>
        <dt>Backlog changed</dt>
        <dd data-testid="backlog-changed">{dash(day(p.backlogChangedAt))}</dd>
        <dt>Version</dt>
        <dd>{dash(p.latestVersion && `v${p.latestVersion}`)}</dd>
        <dt>Last built</dt>
        <dd>{dash(p.latestBuiltDate)}</dd>
      </dl>
      <p className="counts" data-testid="counts">
        {p.error ? (
          DASH
        ) : (
          <>
            Planned <b>{c.planned}</b> <span className="muted">(Ready {c.ready} / Held {c.held})</span> · Blocked{' '}
            <b className={c.blocked ? 'blocked-count' : ''}>{c.blocked}</b> · Ideas <b>{c.ideas}</b>
          </>
        )}
      </p>
    </article>
  );
}

export function Home({ data, go }: { data: Data; go: (r: Route) => void }) {
  const [sort, setSort] = useState<SortKey>(loadSort);
  return (
    <div className="home">
      <label className="sort">
        Sort{' '}
        <select
          aria-label="Sort projects"
          value={sort}
          onChange={(e) => {
            const key = e.target.value as SortKey;
            setSort(key);
            saveSort(key);
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {STATUS_GROUPS.map((g) => {
        const list = sortProjects(data.projects.filter(g.test), sort);
        if (!list.length) return null;
        return (
          <section key={g.key} data-testid={`group-${g.key}`}>
            <h2>
              {g.label} <span className="muted">{list.length}</span>
            </h2>
            <div className="cards">
              {list.map((p) => (
                <Card key={p.repo} p={p} onOpen={() => go({ page: 'project', repo: p.repo })} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlannedList({ sections, empty }: { sections: Section[]; empty: string }) {
  if (!sections.some((s) => s.items.length)) return <p className="muted">{empty}</p>;
  return (
    <>
      {sections.map((s) => (
        <div key={s.name} className="section">
          <h4>{s.name}</h4>
          {s.items.length === 0 && <p className="muted">{DASH}</p>}
          {s.items.map((i, n) => (
            <details key={`${i.id ?? ''}-${n}`} className={`item${i.blocked ? ' is-blocked' : ''}`} data-testid="planned-item">
              <summary>
                {i.id && <span className="id">{i.id}</span>} {i.title}
                <CopyButton text={itemMarkdown(i)} label={`Copy ${i.id ?? i.title}`} />
                {i.blocked && <span className="badge blocked">Blocked</span>}
              </summary>
              <div className="body">{i.body || DASH}</div>
            </details>
          ))}
        </div>
      ))}
    </>
  );
}

function BuiltList({ days, empty }: { days: BuiltDay[]; empty: string }) {
  if (!days.length) return <p className="muted">{empty}</p>;
  return (
    <>
      {days.map((d) => (
        <div key={d.date} className="section" data-testid="built-day">
          <h4>{d.date}</h4>
          <ul className="built">
            {d.items.map((i, n) => (
              <li key={n}>
                {i.id && <span className="id">{i.id}</span>} {i.title}
                <CopyButton text={i.markdown} label={`Copy ${i.id ?? i.title}`} />
                {i.detail && <div className="muted detail">{i.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function ProjectPage({ p }: { p: Project }) {
  return (
    <div className="project">
      <Card p={p} />
      <div className="columns">
        <section data-testid="planned">
          <h2>
            Planned {backlogMarkdown(p.planned) && <CopyButton text={backlogMarkdown(p.planned)} label="Copy whole backlog" />}
          </h2>
          <PlannedList sections={p.planned} empty={p.files.backlog ? 'Nothing planned.' : 'No FEATURE_BACKLOG.md.'} />
        </section>
        <section data-testid="built">
          <h2>Built</h2>
          <BuiltList days={p.built} empty={p.files.built ? 'Nothing built yet.' : 'No BUILT.md.'} />
        </section>
      </div>
      <details className="ideas" data-testid="ideas">
        <summary>
          <h2>Ideas</h2> <span className="muted">{p.ideas.length}</span>
        </summary>
        {p.ideas.length ? (
          <ul>
            {p.ideas.map((i, n) => (
              <li key={n}>
                {i.id && <span className="id">{i.id}</span>} {i.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{p.files.ideas ? 'No ideas.' : 'No IDEAS.md.'}</p>
        )}
      </details>
    </div>
  );
}

export function AllRepos({ data }: { data: Data }) {
  const withPlans = data.projects.filter((p) => p.planned.some((s) => s.items.length));
  const byDay = new Map<string, { repo: string; items: BuiltDay['items'] }[]>();
  for (const p of data.projects) for (const d of p.built) byDay.set(d.date, [...(byDay.get(d.date) ?? []), { repo: p.repo, items: d.items }]);
  const days = [...byDay.keys()].sort().reverse();
  return (
    <div className="columns all">
      <section data-testid="all-planned">
        <h2>Planned, by repo</h2>
        {!withPlans.length && <p className="muted">Nothing planned anywhere.</p>}
        {withPlans.map((p) => (
          <div key={p.repo} className="repo-block">
            <h3>
              <a href={hrefOf({ page: 'project', repo: p.repo })}>{p.repo}</a>{' '}
              <CopyButton text={backlogMarkdown(p.planned)} label={`Copy whole ${p.repo} backlog`} />
            </h3>
            <PlannedList sections={p.planned.filter((s) => s.items.length)} empty="" />
          </div>
        ))}
      </section>
      <section data-testid="all-built">
        <h2>Built, by day</h2>
        {!days.length && <p className="muted">Nothing built anywhere.</p>}
        {days.map((date) => (
          <div key={date} className="section" data-testid="all-built-day">
            <h4>{date}</h4>
            {byDay
              .get(date)!
              .sort((a, b) => a.repo.localeCompare(b.repo))
              .map((r) => (
                <div key={r.repo} className="repo-day">
                  <a className="repo-name" href={hrefOf({ page: 'project', repo: r.repo })}>{r.repo}</a>
                  <ul className="built">
                    {r.items.map((i, n) => (
                      <li key={n}>
                        {i.id && <span className="id">{i.id}</span>} {i.title}
                        <CopyButton text={i.markdown} label={`Copy ${i.id ?? i.title}`} />
                        {i.detail && <div className="muted detail">{i.detail}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}

const KIND_LABEL: Record<Hit['kind'], string> = { planned: 'Planned', built: 'Built', idea: 'Idea' };

export function SearchResults({ data, q }: { data: Data; q: string }) {
  const hits = useMemo(() => search(data.projects, q), [data, q]);
  return (
    <div className="search-results" data-testid="search-results">
      <h2>
        {hits.length} {hits.length === 1 ? 'match' : 'matches'} for “{q.trim()}”
      </h2>
      {hits.map((h, n) => (
        <details key={n} className="item hit" data-testid="hit">
          <summary>
            <a href={hrefOf({ page: 'project', repo: h.repo })} className="repo-name">{h.repo}</a>
            <span className={`badge kind-${h.kind}`}>{KIND_LABEL[h.kind]}</span>
            <span className="muted">{h.where}</span> {h.id && <span className="id">{h.id}</span>} {h.title}
            {h.blocked && <span className="badge blocked">Blocked</span>}
          </summary>
          {h.text && <div className="body">{h.text}</div>}
        </details>
      ))}
    </div>
  );
}

export function Notices({ data }: { data: Data }) {
  return (
    <>
      {data.problems.map((m) => (
        <p key={m} className="warning banner" role="alert">⚠ {m}</p>
      ))}
      {!data.tokenSet && (
        <p className="muted banner" data-testid="no-token">
          No GitHub token set on the server: public repos only; private ones show as unread.
        </p>
      )}
    </>
  );
}

/** Everything below the top bar, for a given state (no fetching; tests render this directly). */
export function View({ data, route, q, go }: { data: Data; route: Route; q: string; go: (r: Route) => void }) {
  if (q.trim()) return <SearchResults data={data} q={q} />;
  if (route.page === 'all') return <AllRepos data={data} />;
  if (route.page === 'project') {
    const p = data.projects.find((x) => x.repo.toLowerCase() === route.repo.toLowerCase());
    return p ? <ProjectPage p={p} /> : <p className="warning">No project “{route.repo}”.</p>;
  }
  return <Home data={data} go={go} />;
}

export function App() {
  const [{ route, q }, setState] = useState(() => parseHash(location.hash));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setState(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    fetch('/api/projects')
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok || !body || body.error) throw new Error(body?.error ?? `HTTP ${r.status}`);
        setData(body as Data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const go = (r: Route) => {
    location.hash = hrefOf(r);
    scrollTo(0, 0);
  };
  const setQ = (value: string) => {
    const h = hrefOf(route) + (value ? `?q=${encodeURIComponent(value)}` : '');
    history.replaceState(null, '', h);
    setState({ route, q: value });
  };

  return (
    <>
      <nav className="topbar">
        <a className="brand" href="#/" onClick={() => setQ('')}>
          <img src="/logo.svg" alt="" width="20" height="20" data-testid="logo" /> backlogkit
        </a>
        <a href="#/" className={route.page === 'home' && !q ? 'on' : ''}>Projects</a>
        <a href="#/all" className={route.page === 'all' && !q ? 'on' : ''}>All repos</a>
        <input type="search" placeholder="Search items by text or ID…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {data && <span className="muted stamp" title={`Read from GitHub at ${data.generatedAt}`}>read {new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
      </nav>
      <main>
        {error && <p className="error banner" role="alert">Could not load projects: {error}</p>}
        {!data && !error && <p className="muted">Reading GitHub…</p>}
        {data && (
          <>
            <Notices data={data} />
            <View data={data} route={route} q={q} go={go} />
          </>
        )}
      </main>
      <SiteVersion {...BUILD_INFO} />
    </>
  );
}
