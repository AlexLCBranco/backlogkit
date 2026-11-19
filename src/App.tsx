// The site: the Board (home: Now, Next and Built stacked, across all repos, BL-9/BL-12), Projects (one compact card each,
// BL-10), Ideas, and the full Built list; search from the top bar filters the board. Routes live in the hash:
// #/ (board), #/projects, #/ideas, #/built, plus ?q=<search>. Old #/p/<repo> URLs open the board filtered to that
// repo; old #/all opens the board.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Data, Estimate, Idea, Project } from './types';
import { SiteVersion } from './SiteVersion';
import { BUILD_INFO } from './build-info';
import { CopyButton } from './CopyButton';
import { SORT_OPTIONS, loadSort, saveSort, sortProjects, type SortKey } from './sort';
import { estimateTotal, formatDuration, ideaMarkdown } from '../lib/lists.mjs';
import {
  BUILT_DAYS,
  COLUMNS,
  boardItems,
  builtCounts,
  builtCutoff,
  builtGroups,
  inFilter,
  loadFilter,
  matches,
  repoColor,
  saveFilter,
  type BoardItem,
} from './board';

/** A field nobody filled in shows as a dash, never a guess. */
const DASH = '—';
const dash = (v: ReactNode | null | undefined) => (v === null || v === undefined || v === '' ? DASH : v);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

// Time estimates (BL-8): a guess on planned items, the measured time on built ones, measured suite times per repo.
export const suiteText = (p: Project) => {
  const s = p.suite;
  if (!s || (!s.last && !s.longest)) return null;
  const one = (x: { minutes: number } | null) => (x ? formatDuration({ min: x.minutes, max: x.minutes })!.replace('~', '') : DASH);
  return `last ${one(s.last)} · longest ${one(s.longest)}`;
};

function EstimateBadge({ e }: { e: Estimate | null }) {
  if (!e) return null;
  if (!e.ok) return <span className="badge estimate bad" data-testid="estimate" title={`Estimate line not readable: ${e.raw}`}>estimate unreadable</span>;
  return (
    <span className="badge estimate" data-testid="estimate" title="Estimate (a guess): build = a Claude Code session building it; suite = the repo's full local test suite">
      build {formatDuration(e.build)} · suite {formatDuration(e.suite)}
    </span>
  );
}

function TookBadge({ t }: { t: Estimate | null }) {
  if (!t) return null;
  if (!t.ok) return <span className="badge took bad" data-testid="took" title={`Time not readable: ${t.raw}`}>time unreadable</span>;
  const n = (d: Estimate['build']) => formatDuration(d)!.replace('~', '');
  return (
    <span className="badge took" data-testid="took" title="Measured: build session and full local test suite">
      took {n(t.build)}{t.suite ? ` · suite ${n(t.suite)}` : ''}
    </span>
  );
}

/** "build ~5 min · suite ~1 min (1 of 2 items estimated)", or "— (no estimates yet)". */
export function estimateText(items: { estimate: Estimate | null }[]): string {
  const t = estimateTotal(items);
  return t.estimated ? `build ${formatDuration(t.build)} · suite ${formatDuration(t.suite)} (${t.estimated} of ${t.total} items estimated)` : `${DASH} (no estimates yet)`;
}

/** Shown only when at least one item has an estimate (BL-12: no "— (no estimates yet)" line). */
export function EstimateTotal({ items, label = 'Estimated' }: { items: { estimate: Estimate | null }[]; label?: string }) {
  if (!estimateTotal(items).estimated) return null;
  return (
    <p className="muted estimate-total" data-testid="estimate-total">
      {label}: {estimateText(items)}
    </p>
  );
}

export type Route = { page: 'board'; only?: string } | { page: 'projects' } | { page: 'ideas' } | { page: 'built' };

export function parseHash(hash: string): { route: Route; q: string } {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query).get('q') ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return { route: { page: 'board', only: decodeURIComponent(parts[1]) }, q }; // old project page
  if (parts[0] === 'projects') return { route: { page: 'projects' }, q };
  if (parts[0] === 'ideas') return { route: { page: 'ideas' }, q };
  if (parts[0] === 'built') return { route: { page: 'built' }, q };
  return { route: { page: 'board' }, q }; // also the old #/all
}

/** The browser tab's title for what's open (BL-6). */
export function titleOf(route: Route, q = ''): string {
  if (q.trim()) return `backlogkit · search “${q.trim()}”`;
  if (route.page === 'projects') return 'backlogkit · Projects';
  if (route.page === 'ideas') return 'backlogkit · Ideas';
  if (route.page === 'built') return 'backlogkit · Built';
  return 'backlogkit · Board';
}

export const hrefOf = (route: Route) =>
  route.page === 'board' ? (route.only ? `#/p/${encodeURIComponent(route.only)}` : '#/') : `#/${route.page}`;

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

/** The card's tooltip (BL-10): suite times and the planned items' estimate total. */
export function cardTooltip(p: Project): string {
  const planned = p.planned.filter((s) => s.kind !== 'other').flatMap((s) => s.items);
  return `Suite time: ${suiteText(p) ?? DASH}\nEstimated: ${planned.length ? estimateText(planned) : DASH}`;
}

export function Card({ p, onOpen }: { p: Project; onOpen?: () => void }) {
  const c = p.counts;
  return (
    <article className={`card${onOpen ? ' clickable' : ''}`} data-testid={`card-${p.repo}`} onClick={onOpen} title={cardTooltip(p)}>
      <header>
        <h3>{onOpen ? <a href={hrefOf({ page: 'board', only: p.repo })} onClick={(e) => e.stopPropagation()}>{p.repo}</a> : p.repo}</h3>
        <span className={`status status-${p.status ?? 'none'}`}>{dash(p.status)}</span>
      </header>
      <p className="desc">{dash(p.description)}</p>
      {p.warning && <p className="warning" role="alert">⚠ {p.warning}</p>}
      {p.error && <p className="error" role="alert">✕ {p.error}</p>}
      <p className="meta" data-testid="meta">
        <span data-testid="meta-line">
          <span className="nw">{dash(p.latestVersion && `v${p.latestVersion}`)}</span> · <span className="nw">{dash(p.devices?.join(', '))}</span> ·{' '}
          <span className="nw">pushed {dash(day(p.github?.pushedAt ?? null))}</span> · <span className="nw">built {dash(p.latestBuiltDate)}</span>
        </span>{' '}
        · <span data-testid="live-link"><ExtLink href={p.url}>{p.url?.replace(/^https?:\/\//, '')}</ExtLink></span> ·{' '}
        <span data-testid="repo-link"><ExtLink href={p.github?.url ?? null}>repo</ExtLink></span>
        {p.github && (p.github.private || p.github.archived) && (
          <span className="muted"> ({[p.github.private && 'private', p.github.archived && 'archived'].filter(Boolean).join(', ')})</span>
        )}
      </p>
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

export function ProjectsPage({ data, go }: { data: Data; go: (r: Route) => void }) {
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
                <Card key={p.repo} p={p} onOpen={() => go({ page: 'board', only: p.repo })} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A repo's colour dot; the name shows on hover. */
function RepoDot({ repo }: { repo: string }) {
  return <span className="dot" data-testid="repo-dot" title={repo} aria-label={repo} role="img" style={{ background: repoColor(repo) }} />;
}

function BoardLine({ item, first, dot }: { item: BoardItem; first: boolean; dot: boolean }) {
  const label = `Copy ${item.id ?? item.title}`;
  return (
    <details className={`bitem${item.blocked ? ' is-blocked' : ''}${first ? ' group-start' : ''}`} data-testid="board-item" data-repo={item.repo}>
      <summary>
        {dot && <RepoDot repo={item.repo} />}
        {item.id && <span className="id">{item.id}</span>}
        <span className="title">{item.title}</span>
        {item.blocked && <span className="badge blocked">Blocked</span>}
        <CopyButton text={item.markdown} label={label} />
      </summary>
      <div className="body">
        {item.date && <div className="muted when">{item.date}</div>}
        {(item.estimate || item.took) && (
          <div className="badges">
            <EstimateBadge e={item.estimate} />
            <TookBadge t={item.took} />
          </div>
        )}
        {item.body || item.title}
      </div>
    </details>
  );
}

const NOTHING = <p className="muted empty">Nothing here</p>;

/**
 * The home board (BL-9, BL-12): Now, Next and Built stacked full width. `only` (from an old project URL or a project
 * card) selects that one project; otherwise the chips this browser remembers. Built is one collapsed line until
 * clicked; while searching it looks through every day, not just the last 7, and opens so the matches show.
 */
export function Board({ data, q, only, now }: { data: Data; q: string; only?: string; now?: Date }) {
  const sort = loadSort();
  const projects = useMemo(() => sortProjects(data.projects.filter((p) => !p.noFiles), sort), [data, sort]);
  const resolve = (name: string) => projects.find((p) => p.repo.toLowerCase() === name.toLowerCase())?.repo;
  const [selected, setSelected] = useState<string[]>(() => {
    const one = only && resolve(only);
    return one ? [one] : loadFilter();
  });
  useEffect(() => {
    const one = only && resolve(only);
    if (one) {
      setSelected([one]);
      saveFilter([one]);
    }
  }, [only, projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const [builtOpen, setBuiltOpen] = useState(false);
  const choose = (next: string[]) => {
    setSelected(next);
    saveFilter(next);
  };
  const valid = selected.filter((s) => projects.some((p) => p.repo === s));
  const dots = valid.length !== 1; // one repo shown: a dot would say nothing
  const searching = !!q.trim();
  const cutoff = builtCutoff(now ?? new Date());
  const items = useMemo(() => boardItems(data, sort, searching ? null : cutoff), [data, sort, searching, cutoff]);
  const visible = items.filter((i) => inFilter(i, valid) && matches(i, q));
  const builtLabel = searching ? 'Built' : `Built (${BUILT_DAYS} days)`;
  const groups = builtGroups(visible);
  const builtTotal = groups.reduce((n, g) => n + g.items.length, 0);
  const open = builtTotal > 0 && (builtOpen || searching);

  return (
    <div className="board-page">
      <div className="chips" role="group" aria-label="Filter by project">
        <button type="button" className="chip" aria-pressed={!valid.length} onClick={() => choose([])}>
          All
        </button>
        {projects.map((p) => {
          const on = valid.includes(p.repo);
          return (
            <button key={p.repo} type="button" className="chip" aria-pressed={on} onClick={() => choose(on ? valid.filter((x) => x !== p.repo) : [...valid, p.repo])}>
              {p.repo}
            </button>
          );
        })}
        {searching && <span className="muted search-note">matching “{q.trim()}”</span>}
      </div>
      <div className="board">
        {COLUMNS.filter((c) => c.key !== 'built').map((c) => {
          const list = visible.filter((i) => i.column === c.key);
          return (
            <section key={c.key} className={`col col-${c.key}${list.length ? '' : ' is-empty'}`} data-testid={`col-${c.key}`}>
              <h2>
                {c.label} <span className="muted count">{list.length}</span>
              </h2>
              <EstimateTotal items={list} />
              {!list.length && NOTHING}
              {list.map((i, n) => (
                <BoardLine key={i.key} item={i} dot={dots} first={n > 0 && list[n - 1]!.repo !== i.repo} />
              ))}
            </section>
          );
        })}
        <section className={`col col-built${builtTotal ? '' : ' is-empty'}`} data-testid="col-built">
          <h2>
            <button type="button" className="fold" aria-expanded={open} disabled={!builtTotal} onClick={() => setBuiltOpen(!open)} data-testid="built-toggle">
              {builtTotal > 0 && <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>}
              {builtLabel} <span className="muted count">{builtTotal}</span>
              {builtTotal > 0 && <span className="muted built-counts" data-testid="built-counts"> — {builtCounts(groups)}</span>}
            </button>
          </h2>
          {!builtTotal && NOTHING}
          {open &&
            groups.map((g) => (
              <div key={g.repo} className="repo-group" data-testid="built-group" data-repo={g.repo}>
                <h3>
                  {dots && <RepoDot repo={g.repo} />}
                  {g.repo} <span className="muted count">{g.items.length}</span>
                </h3>
                {g.items.map((i) => (
                  <BoardLine key={i.key} item={i} dot={false} first={false} />
                ))}
              </div>
            ))}
          {open && (
            <p className="all-built">
              <a href={hrefOf({ page: 'built' })}>All built</a>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Every repo's built items, by day, newest first (the board's "All built" link). */
export function BuiltPage({ data }: { data: Data }) {
  const sort = loadSort();
  const items = boardItems(data, sort, null).filter((i) => i.column === 'built');
  const days = [...new Set(items.map((i) => i.date!))];
  return (
    <section className="built-page" data-testid="all-built">
      <h2>All built</h2>
      {!days.length && <p className="muted">Nothing built anywhere.</p>}
      {days.map((date) => (
        <div key={date} className="section" data-testid="all-built-day">
          <h4>{date}</h4>
          <ul className="built">
            {items
              .filter((i) => i.date === date)
              .map((i) => (
                <li key={i.key}>
                  <span className="tag">{i.repo}</span> {i.id && <span className="id">{i.id}</span>} {i.title}
                  <CopyButton text={i.markdown} label={`Copy ${i.id ?? i.title}`} />
                  <TookBadge t={i.took} />
                  {i.body && <div className="muted detail">{i.body}</div>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function IdeaList({ ideas }: { ideas: Idea[] }) {
  return (
    <ul className="idea-list">
      {ideas.map((i, n) => (
        <li key={`${i.id ?? ''}-${n}`} data-testid="idea">
          {i.id && <span className="id">{i.id}</span>} {i.title}
          <CopyButton text={ideaMarkdown(i)} label={`Copy ${i.id ?? i.title}`} />
        </li>
      ))}
    </ul>
  );
}

const ideasMarkdown = (ideas: Idea[]) => ideas.map(ideaMarkdown).join('\n') + '\n';

/** Every repo's IDEAS.md in one place (BL-7), after the ideas that belong to no repo yet (UNASSIGNED_IDEAS.md). */
export function IdeasPage({ data }: { data: Data }) {
  const withIdeas = data.projects.filter((p) => p.ideas.length);
  const un = data.unassigned;
  return (
    <div className="ideas-page">
      <section className="repo-block" data-testid="ideas-unassigned">
        <h3>
          Unassigned <span className="muted">{un.ideas.length}</span>{' '}
          {un.ideas.length > 0 && <CopyButton text={ideasMarkdown(un.ideas)} label="Copy all Unassigned ideas" />}
        </h3>
        {un.ideas.length ? <IdeaList ideas={un.ideas} /> : <p className="muted">{un.file ? 'No unassigned ideas.' : 'No UNASSIGNED_IDEAS.md.'}</p>}
      </section>
      {withIdeas.map((p) => (
        <section key={p.repo} className="repo-block" data-testid={`ideas-${p.repo}`}>
          <h3>
            <a href={hrefOf({ page: 'board', only: p.repo })}>{p.repo}</a> <span className="muted">{p.ideas.length}</span>{' '}
            <CopyButton text={ideasMarkdown(p.ideas)} label={`Copy all ${p.repo} ideas`} />
          </h3>
          <IdeaList ideas={p.ideas} />
        </section>
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

/** Everything below the top bar, for a given state (no fetching; tests render this directly). A query shows the board. */
export function View({ data, route, q, go, now }: { data: Data; route: Route; q: string; go: (r: Route) => void; now?: Date }) {
  if (!q.trim()) {
    if (route.page === 'projects') return <ProjectsPage data={data} go={go} />;
    if (route.page === 'ideas') return <IdeasPage data={data} />;
    if (route.page === 'built') return <BuiltPage data={data} />;
  }
  return <Board data={data} q={q} only={route.page === 'board' ? route.only : undefined} now={now} />;
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

  useEffect(() => {
    document.title = titleOf(route, q);
  }, [route, q]);

  // An old project URL (or a project card) opens the board filtered to it; once the board has taken the filter, the
  // address becomes plain #/ so the chips stay in charge.
  useEffect(() => {
    if (data && route.page === 'board' && route.only) {
      history.replaceState(null, '', '#/' + (q ? `?q=${encodeURIComponent(q)}` : ''));
      setState({ route: { page: 'board' }, q });
    }
  }, [data, route, q]);

  const go = (r: Route) => {
    location.hash = hrefOf(r);
    scrollTo(0, 0);
  };
  const setQ = (value: string) => {
    const to: Route = value ? { page: 'board' } : route;
    history.replaceState(null, '', hrefOf(to) + (value ? `?q=${encodeURIComponent(value)}` : ''));
    setState({ route: to, q: value });
  };
  const onBoard = route.page === 'board' || !!q;

  return (
    <>
      <nav className="topbar">
        <a className="brand" href="#/" onClick={() => setQ('')}>
          <img src="/logo.svg" alt="" width="20" height="20" data-testid="logo" /> backlogkit
        </a>
        <a href="#/" className={onBoard ? 'on' : ''}>Board</a>
        <a href="#/projects" className={route.page === 'projects' && !q ? 'on' : ''}>Projects</a>
        <a href="#/ideas" className={route.page === 'ideas' && !q ? 'on' : ''}>Ideas</a>
        <input type="search" placeholder="Search the board by text or ID…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
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
