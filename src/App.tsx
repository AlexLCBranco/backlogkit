// The site: Home (five lanes across all repos with a number strip on top, BL-14), Projects (one compact card each,
// BL-10), Ideas, and Everything built; search from the top bar shows Home filtered. Routes live in the hash:
// #/ (home), #/projects, #/ideas, #/built, plus ?q=<search>. Old #/p/<repo> URLs open Home filtered to that repo; old
// #/all opens Home.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Data, Estimate, Idea, Project } from './types';
import { SiteVersion } from './SiteVersion';
import { BUILD_INFO } from './build-info';
import { CopyButton } from './CopyButton';
import { MoveButton, OwnerContext, OwnerControl, useOwner, useOwnerState } from './owner';
import { SORT_OPTIONS, loadSort, saveSort, sortProjects, type SortKey } from './sort';
import { estimateTotal, formatDuration, ideaMarkdown } from '../lib/lists.mjs';
import {
  LANES,
  boardIdeas,
  boardItems,
  builtCutoff,
  builtGroups,
  loadSeen,
  markSeen,
  newCutoff,
  newDone,
  saveSeen,
  ideaMatches,
  inFilter,
  laneCounts,
  loadFilter,
  matches,
  projectLaneCounts,
  saveFilter,
  WHY_GROUPS,
  ideaGroups,
  isWhyKey,
  planTargets,
  type BoardIdea,
  type BoardItem,
  type Lane,
  type WhyKey,
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

export type Route = { page: 'board'; only?: string } | { page: 'projects' } | { page: 'ideas'; group?: WhyKey } | { page: 'built' };

export function parseHash(hash: string): { route: Route; q: string } {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query).get('q') ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return { route: { page: 'board', only: decodeURIComponent(parts[1]) }, q }; // old project page
  if (parts[0] === 'projects') return { route: { page: 'projects' }, q };
  if (parts[0] === 'ideas') return { route: isWhyKey(parts[1]) ? { page: 'ideas', group: parts[1] } : { page: 'ideas' }, q };
  if (parts[0] === 'built') return { route: { page: 'built' }, q };
  return { route: { page: 'board' }, q }; // also the old #/all
}

/** The browser tab's title for what's open (BL-6). */
export function titleOf(route: Route, q = ''): string {
  if (q.trim()) return `backlogkit · search “${q.trim()}”`;
  if (route.page === 'projects') return 'backlogkit · Projects';
  if (route.page === 'ideas') return 'backlogkit · Ideas';
  if (route.page === 'built') return 'backlogkit · Built';
  return 'backlogkit · Home';
}

export const hrefOf = (route: Route) =>
  route.page === 'board'
    ? route.only
      ? `#/p/${encodeURIComponent(route.only)}`
      : '#/'
    : route.page === 'ideas' && route.group
      ? `#/ideas/${route.group}`
      : `#/${route.page}`;

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
  const lanes = projectLaneCounts(p);
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
            Stuck <b className={lanes.stuck ? 'blocked-count' : ''}>{lanes.stuck}</b> · Will be built next <b>{lanes.next}</b> · Waiting for your OK{' '}
            <b>{lanes.waiting}</b> · Ideas <b>{lanes.ideas}</b>
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

/**
 * Answering a stuck item (BL-16): "Answer" opens a text box; Save writes the answer into the repo's
 * FEATURE_BACKLOG.md (one commit) and the item leaves Stuck. Locked: a line saying how to answer. Moves off: nothing.
 */
function StuckAnswer({ item }: { item: BoardItem }) {
  const o = useOwner();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!o.canMove || !item.id) return null;
  if (!o.unlocked)
    return (
      <p className="muted answer-locked" data-testid="answer-locked">
        Unlock as owner to answer
      </p>
    );
  if (!open)
    return (
      <div className="answer-row">
        <button type="button" className="move" data-testid="answer" onClick={() => setOpen(true)}>
          Answer
        </button>
      </div>
    );
  const cancel = () => {
    setOpen(false);
    setText('');
    setErr(null);
  };
  return (
    <form
      className="answer-form"
      data-testid="answer-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return setErr('Type an answer first.');
        setBusy(true);
        setErr(null);
        const error = await o.move({ action: 'answer', repo: item.repo, id: item.id!, answer: text });
        setBusy(false);
        setErr(error); // on success the item has left Stuck and this form is gone
      }}
    >
      <textarea aria-label={`Answer for ${item.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <button type="submit" disabled={busy}>{busy ? '…' : 'Save'}</button>
      <button type="button" className="cancel" onClick={cancel} disabled={busy}>
        Cancel
      </button>
      {err && (
        <span className="error" role="alert" data-testid="answer-error">
          {err}
        </span>
      )}
    </form>
  );
}

function BoardLine({ item, first }: { item: BoardItem; first: boolean }) {
  if (item.lane === 'stuck')
    return (
      <div className={`stuck-card${first ? ' group-start' : ''}`} data-testid="stuck-card">
        <ItemDetails item={item} first={false} />
        <StuckAnswer item={item} />
      </div>
    );
  return <ItemDetails item={item} first={first} />;
}

function ItemDetails({ item, first }: { item: BoardItem; first: boolean }) {
  const label = `Copy ${item.id ?? item.title}`;
  return (
    <details className={`bitem${first ? ' group-start' : ''}`} data-testid="board-item" data-repo={item.repo}>
      <summary>
        <ProjectLabel repo={item.repo} />
        <span className="title">
          {item.short ?? item.title}
          {!item.short && item.lane !== 'done' && (
            <span className="badge no-summary" data-testid="no-summary" title="This spec has no “In short” line yet">
              no summary yet
            </span>
          )}
          {item.lane === 'stuck' && item.blockedNote && (
            <span className="blocked-note" data-testid="blocked-note">
              {item.blockedNote.text}
              {item.blockedNote.date && <span className="note-date">{item.blockedNote.date}</span>}
            </span>
          )}
        </span>
        {item.lane === 'waiting' && item.id && (
          <MoveButton label="Give OK" title={`Give OK to ${item.id}: it moves to “Will be built next” in ${item.repo}`} req={{ action: 'ready', repo: item.repo, id: item.id }} />
        )}
        <CopyButton text={item.markdown} label={label} />
        {item.id && <span className="id">{item.id}</span>}
      </summary>
      <div className="body">
        {item.short && <div className="spec-title">{item.title}</div>}
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

const laneId = (k: Lane) => `lane-${k}`;

/** Five big numbers, one per lane; a click scrolls to that lane. */
function NumberStrip({ counts }: { counts: Record<Lane, number> }) {
  return (
    <nav className="strip" aria-label="Lanes" data-testid="strip">
      {LANES.map((l) => (
        <button
          key={l.key}
          type="button"
          className={`strip-n strip-${l.key}${counts[l.key] ? ' has' : ''}`}
          data-testid={`strip-${l.key}`}
          title={`Go to “${l.label}”`}
          onClick={() => document.getElementById(laneId(l.key))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <b>{counts[l.key]}</b>
          <span>{l.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Lane({ k, count, children, extra, always }: { k: Lane; count: number; children: ReactNode; extra?: ReactNode; always?: boolean }) {
  const l = LANES.find((x) => x.key === k)!;
  return (
    <section id={laneId(k)} className={`lane lane-${k}${count ? '' : ' is-empty'}`} data-testid={laneId(k)}>
      <h2>
        {l.label} <span className="muted count">{count}</span>
      </h2>
      {extra}
      {count || always ? children : <p className="muted empty">{l.empty}</p>}
    </section>
  );
}

/** One project's new built items (BL-18): a row with its count and newest line; a click unfolds the items. */
function DoneGroup({ repo, items }: { repo: string; items: BoardItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="done-group" data-testid="done-group" data-repo={repo}>
      <button type="button" className="done-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <ProjectLabel repo={repo} /> <b>{items.length}</b> <span className="newest">{items[0]!.title}</span>
      </button>
      {open && (
        <ul className="done-items">
          {items.map((i) => (
            <li key={i.key} data-testid="done-item">
              <span className="done-title">{i.title}</span>
              {i.id && <span className="id">{i.id}</span>}
              <CopyButton text={i.markdown} label={`Copy ${i.id ?? i.title}`} />
              {i.body && <div className="muted done-detail">{i.body}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const grouped = (list: BoardItem[]) => list.map((i, n) => <BoardLine key={i.key} item={i} first={n > 0 && list[n - 1]!.repo !== i.repo} />);

/**
 * The home page (BL-14): the number strip, project chips, then the five lanes in fixed order. `only` (from an old
 * project URL or a project card) selects that one project; otherwise the chips this browser remembers. While
 * searching, Done looks through every day and Ideas lists the matching ideas.
 */
export function Home({ data, q, only, now }: { data: Data; q: string; only?: string; now?: Date }) {
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
  const choose = (next: string[]) => {
    setSelected(next);
    saveFilter(next);
  };
  const valid = selected.filter((s) => projects.some((p) => p.repo === s));
  const searching = !!q.trim();
  const today = now ?? new Date();
  const cutoff = newCutoff(today);
  const items = useMemo(() => boardItems(data, sort, searching ? null : cutoff), [data, sort, searching, cutoff]);
  const [seen, setSeen] = useState<string[] | null>(loadSeen);
  const ideas = useMemo(() => boardIdeas(data, sort), [data, sort]);
  const visible = items.filter((i) => inFilter(i, valid) && matches(i, q));
  const visibleIdeas = ideas.filter((i) => inFilter(i, valid) && ideaMatches(i, q));
  const fresh = newDone(visible, seen, today);
  const lastWeek = visible.filter((i) => i.lane === 'done' && i.date! >= builtCutoff(today)).length;
  const counts = { ...laneCounts(visible, visibleIdeas), ...(searching ? {} : { done: fresh.length }) };
  const markAll = () => {
    const next = markSeen(items, seen, fresh, today);
    saveSeen(next);
    setSeen(next);
  };
  const of = (k: Lane) => visible.filter((i) => i.lane === k);
  const groups = builtGroups(visible);

  return (
    <div className="board-page">
      <NumberStrip counts={counts} />
      <div className="chips" role="group" aria-label="Filter by project">
        <button type="button" className="chip" aria-pressed={!valid.length} onClick={() => choose([])}>
          All projects
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
        <Lane k="stuck" count={counts.stuck}>{grouped(of('stuck'))}</Lane>
        <Lane k="next" count={counts.next} extra={<EstimateTotal items={of('next')} />}>{grouped(of('next'))}</Lane>
        <Lane k="waiting" count={counts.waiting} extra={<EstimateTotal items={of('waiting')} />}>{grouped(of('waiting'))}</Lane>
        <Lane k="ideas" count={counts.ideas}>
          {searching ? (
            <ul className="idea-list">
              {visibleIdeas.map((i) => (
                <li key={i.key} data-testid="idea">
                  <ProjectLabel repo={i.repo} /> {i.idea.id && <span className="id">{i.idea.id}</span>} {i.idea.text}
                </li>
              ))}
            </ul>
          ) : (
            ideaGroups(visibleIdeas)
              .filter((g) => g.ideas.length)
              .map((g) => (
                <a key={g.key} className="ideas-group-row" data-testid="ideas-row" href={hrefOf({ page: 'ideas', group: g.key })}>
                  <span className="group-name">{g.label}</span> <b>{g.ideas.length}</b> <span className="muted first-idea">{g.ideas[0]!.idea.text}</span>
                </a>
              ))
          )}
        </Lane>
        <Lane k="done" count={counts.done} always={!searching}>
          {searching ? (
            groups.map((g) => (
              <div key={g.repo} className="repo-group" data-testid="built-group" data-repo={g.repo}>
                <h3>
                  {g.repo} <span className="muted count">{g.items.length}</span>
                </h3>
                {g.items.map((i) => (
                  <BoardLine key={i.key} item={i} first={false} />
                ))}
              </div>
            ))
          ) : (
            <>
              <h3 className="done-summary" data-testid="done-summary">
                {fresh.length ? `${fresh.length} new since you last looked` : `Nothing new · ${lastWeek} built in the last 7 days`}
              </h3>
              {builtGroups(fresh).map((g) => (
                <DoneGroup key={g.repo} repo={g.repo} items={g.items} />
              ))}
            </>
          )}
          <p className="all-built">
            {!searching && fresh.length > 0 && (
              <button type="button" className="mark-seen" data-testid="mark-seen" onClick={markAll}>
                Mark all seen
              </button>
            )}
            <a href={hrefOf({ page: 'built' })}>Everything built</a>
          </p>
        </Lane>
      </div>
    </div>
  );
}

/** A project's name as a neutral label; null = an unassigned idea. */
export function ProjectLabel({ repo }: { repo: string | null }) {
  return repo === null ? (
    <span className="tag tag-unassigned" data-testid="repo-label">Unassigned</span>
  ) : (
    <span className="tag" data-testid="repo-label">{repo}</span>
  );
}


/** Every repo's built items, by day, newest first (the board's "All built" link). */
export function BuiltPage({ data }: { data: Data }) {
  const sort = loadSort();
  const items = boardItems(data, sort, null).filter((i) => i.lane === 'done');
  const days = [...new Set(items.map((i) => i.date!))];
  return (
    <section className="built-page" data-testid="all-built">
      <h2>Everything built</h2>
      {!days.length && <p className="muted">Nothing built anywhere.</p>}
      {days.map((date) => (
        <div key={date} className="section" data-testid="all-built-day">
          <h4>{date}</h4>
          <ul className="built">
            {items
              .filter((i) => i.date === date)
              .map((i) => (
                <li key={i.key}>
                  <ProjectLabel repo={i.repo} /> {i.id && <span className="id">{i.id}</span>} {i.title}
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

/** An unassigned idea's move: pick the repo it goes to, then Plan it (BL-11). */
function UnassignedMove({ idea, targets }: { idea: Idea; targets: string[] }) {
  const [to, setTo] = useState('');
  if (!useOwner().unlocked) return null;
  return (
    <>
      <select className="move-to" aria-label={`Repo for ${idea.id}`} value={to} onChange={(e) => setTo(e.target.value)} data-testid="move-to">
        <option value="">to repo…</option>
        {targets.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <MoveButton label="Plan it" title={`Plan ${idea.id}: it moves to “Waiting for your OK” in ${to || 'the chosen repo'}`} req={to ? { action: 'idea', repo: to, id: idea.id!, from: 'unassigned' } : null} />
    </>
  );
}

/** The owner's reason dropdown (BL-17): one commit setting the idea's [why: …] tag; "No reason yet" removes it. */
function ReasonSelect({ bi }: { bi: BoardIdea }) {
  const o = useOwner();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = bi.idea.id;
  if (!o.unlocked || !id) return null;
  return (
    <>
      <select
        className="reason"
        aria-label={`Reason for ${id}`}
        data-testid="reason"
        value={bi.idea.why ?? 'none'}
        disabled={busy}
        onChange={async (e) => {
          const why = e.target.value;
          setBusy(true);
          setErr(null);
          const error = await o.move(bi.repo === null ? { action: 'reason', repo: '', id, why, from: 'unassigned' } : { action: 'reason', repo: bi.repo, id, why });
          setBusy(false);
          setErr(error);
        }}
      >
        {WHY_GROUPS.map((g) => (
          <option key={g.key} value={g.key}>{g.label}</option>
        ))}
      </select>
      {err && <span className="error move-error" role="alert" data-testid="move-error">{err}</span>}
    </>
  );
}

function IdeaRow({ bi, targets }: { bi: BoardIdea; targets: string[] }) {
  const i = bi.idea;
  return (
    <li data-testid="idea" data-repo={bi.repo ?? 'unassigned'}>
      <div className="idea-main">
        <ProjectLabel repo={bi.repo} /> {i.id && <span className="id">{i.id}</span>} <span className="idea-text">{i.text}</span>
        <CopyButton text={ideaMarkdown(i)} label={`Copy ${i.id ?? i.text}`} />
        {i.id && bi.repo === null && <UnassignedMove idea={i} targets={targets} />}
        {i.id && bi.repo !== null && targets.includes(bi.repo) && (
          <MoveButton label="Plan it" title={`Plan ${i.id}: it moves to “Waiting for your OK” in ${bi.repo}`} req={{ action: 'idea', repo: bi.repo, id: i.id }} />
        )}
        <ReasonSelect bi={bi} />
      </div>
      {i.note && <div className="muted idea-note" data-testid="idea-note">{i.note}</div>}
    </li>
  );
}

/**
 * Every idea in one place (BL-7), grouped by why it isn't planned (BL-17): Needs your decision, Waiting on something,
 * Too big, Not important yet, No reason yet, Maybe never (folded). Unassigned ideas are in it with their own label.
 * `group` (from #/ideas/<group>) scrolls to that group and opens it.
 */
export function IdeasPage({ data, group }: { data: Data; group?: WhyKey }) {
  const groups = ideaGroups(boardIdeas(data, loadSort()));
  const targets = planTargets(data);
  useEffect(() => {
    if (group) document.getElementById(`why-${group}`)?.scrollIntoView?.({ block: 'start' });
  }, [group]);
  return (
    <div className="ideas-page">
      {groups.map((g) => {
        const head = (
          <h3>
            {g.label} <span className="muted count">{g.ideas.length}</span>
          </h3>
        );
        const list = g.ideas.length ? (
          <ul className="idea-list">
            {g.ideas.map((bi) => (
              <IdeaRow key={bi.key} bi={bi} targets={targets} />
            ))}
          </ul>
        ) : (
          <p className="muted empty">None.</p>
        );
        return g.folded ? (
          <details key={g.key} id={`why-${g.key}`} className="why-group" data-testid={`why-${g.key}`} open={group === g.key}>
            <summary>{head}</summary>
            {list}
          </details>
        ) : (
          <section key={g.key} id={`why-${g.key}`} className="why-group" data-testid={`why-${g.key}`}>
            {head}
            {list}
          </section>
        );
      })}
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

/** Everything below the top bar, for a given state (no fetching; tests render this directly). A query shows the home page. */
export function View({ data, route, q, go, now }: { data: Data; route: Route; q: string; go: (r: Route) => void; now?: Date }) {
  if (!q.trim()) {
    if (route.page === 'projects') return <ProjectsPage data={data} go={go} />;
    if (route.page === 'ideas') return <IdeasPage data={data} group={route.group} />;
    if (route.page === 'built') return <BuiltPage data={data} />;
  }
  return <Home data={data} q={q} only={route.page === 'board' ? route.only : undefined} now={now} />;
}

export function App() {
  const [{ route, q }, setState] = useState(() => parseHash(location.hash));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = useOwnerState(data, setData);

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
    <OwnerContext.Provider value={owner}>
      <nav className="topbar">
        <a className="brand" href="#/" onClick={() => setQ('')}>
          <img src="/logo.svg" alt="" width="20" height="20" data-testid="logo" /> backlogkit
        </a>
        <a href="#/" className={onBoard ? 'on' : ''}>Home</a>
        <a href="#/projects" className={route.page === 'projects' && !q ? 'on' : ''}>Projects</a>
        <a href="#/ideas" className={route.page === 'ideas' && !q ? 'on' : ''}>Ideas</a>
        <input type="search" placeholder="Search everything…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {data && <span className="muted stamp" title={`Read from GitHub at ${data.generatedAt}`}>read {new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
        <OwnerControl />
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
    </OwnerContext.Provider>
  );
}
