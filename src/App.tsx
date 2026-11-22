// The site: Home (five lanes across all repos with a number strip on top, BL-14), Projects (one compact card each,
// BL-10), Ideas, and Everything built, under the shared pinned header (BL-19, NAV_PATTERN.md). Every state lives in
// the address (src/nav.ts); old #/p/<repo> and #/all addresses still open Home.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Header, type PageHistory } from './Header';
import { PageRows } from './PageRows';
import { hasProjects, hrefOf, navLabel, parseHash, resolveProjects, shownPlace, titleOf, type Nav } from './nav';
import { SelectionBar, SelectionStyle, createSelectionStore, selectionText, useMarqueeSelection } from './selection';
import type { Data, Estimate, Idea, Project } from './types';
import { SiteVersion } from './SiteVersion';
import { BUILD_INFO } from './build-info';
import { CopyButton } from './CopyButton';
import { CodeBox } from './CodeBox';
import { codePrefixes, lookupCode, parseCode } from './code';
import { codeIndex } from './waits';
import { MoveButton, OwnerContext, OwnerControl, useOwner, useOwnerState } from './owner';
import { saveSort, sortProjects, type SortKey } from './sort';
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
  projectUnblockCount,
  unblockCount,
  unblockText,
  matches,
  projectLaneCounts,
  WHY_GROUPS,
  ideaGroups,
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

/** Internal navigation: links keep their address (open in a new tab works) but move through the app's history. */
const GoContext = createContext<(n: Nav) => void>(() => {});
export function NavLink({ to, className, children, testId }: { to: Nav; className?: string; children: ReactNode; testId?: string }) {
  const go = useContext(GoContext);
  return (
    <a
      href={hrefOf(to)}
      className={className}
      data-testid={testId}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

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

export function Card({ p, onOpen, sort, unblock = 0 }: { p: Project; onOpen?: () => void; sort: SortKey; unblock?: number }) {
  const lanes = projectLaneCounts(p);
  return (
    <article className={`card${onOpen ? ' clickable' : ''}`} data-testid={`card-${p.repo}`} onClick={onOpen} title={cardTooltip(p)}>
      <header>
        <h3>{onOpen ? <NavLink to={{ page: 'board', p: [p.repo], q: '', sort }}>{p.repo}</NavLink> : p.repo}</h3>
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
            Stuck <b className={lanes.stuck ? 'blocked-count' : ''}>{lanes.stuck}</b>
            {unblock > 0 && <span className="unblock-count" data-testid="card-unblock"> ({unblockText(unblock)})</span>} · Will be built next <b>{lanes.next}</b> · Waiting for your OK{' '}
            <b>{lanes.waiting}</b> · Ideas <b>{lanes.ideas}</b>
          </>
        )}
      </p>
    </article>
  );
}

export function ProjectsPage({ data, nav, go }: { data: Data; nav: Nav; go: (n: Nav) => void }) {
  const sort = nav.sort;
  const index = useMemo(() => codeIndex(data), [data]);
  return (
    <div className="home">
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
                <Card key={p.repo} p={p} sort={sort} unblock={projectUnblockCount(p, index)} onOpen={() => go({ page: 'board', p: [p.repo], q: '', sort })} />
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
      <div className={`stuck-card${first ? ' group-start' : ''}${item.waits?.ready ? ' can-unblock' : ''}`} data-testid="stuck-card">
        <ItemDetails item={item} first={false} />
        <StuckAnswer item={item} />
      </div>
    );
  return <ItemDetails item={item} first={first} />;
}

function ItemDetails({ item, first }: { item: BoardItem; first: boolean }) {
  const label = `Copy ${item.id ?? item.title}`;
  return (
    <details className={`bitem${first ? ' group-start' : ''}`} data-testid="board-item" data-repo={item.repo} data-select-key={item.key}>
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
          {item.lane === 'stuck' && item.waits && (
            <span className={`waits${item.waits.ready ? ' ready' : ''}`} data-testid="waits">
              {item.waits.lines.map((l) => (
                <span key={l} className="waits-line">{l}</span>
              ))}
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
function NumberStrip({ counts, unblock }: { counts: Record<Lane, number>; unblock: number }) {
  return (
    <nav className="strip" aria-label="Lanes" data-testid="strip" data-no-marquee>
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
          {l.key === 'stuck' && unblock > 0 && <em className="unblock-count" data-testid="strip-unblock">{unblockText(unblock)}</em>}
        </button>
      ))}
    </nav>
  );
}

function Lane({ k, count, children, extra, always, note }: { k: Lane; count: number; children: ReactNode; extra?: ReactNode; always?: boolean; note?: ReactNode }) {
  const l = LANES.find((x) => x.key === k)!;
  return (
    <section id={laneId(k)} className={`lane lane-${k}${count ? '' : ' is-empty'}`} data-testid={laneId(k)}>
      <h2>
        {l.label} <span className="muted count">{count}</span>
        {note}
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
            <li key={i.key} data-testid="done-item" data-select-key={i.key}>
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
 * The home page (BL-14): the number strip, then the five lanes in fixed order, for the projects chosen in the What
 * chips (BL-19: in the address). While searching, Done looks through every day and Ideas lists the matching ideas.
 */
export function Home({ data, q, selected: valid, sort, now }: { data: Data; q: string; selected: string[]; sort: SortKey; now?: Date }) {
  const searching = !!q.trim();
  const today = now ?? new Date();
  const cutoff = newCutoff(today);
  const items = useMemo(() => boardItems(data, sort, searching ? null : cutoff), [data, sort, searching, cutoff]);
  const [seen, setSeen] = useState<string[] | null>(loadSeen);
  const ideas = useMemo(() => boardIdeas(data, sort), [data, sort]);
  // A search that is exactly a code (BL-20): explained in a box on top; the results below are that code's items.
  const code = useMemo(() => parseCode(q, data.projects.map((p) => p.repo), codePrefixes(data)), [data, q]);
  const codeHits = useMemo(() => (code ? lookupCode(data, code, valid) : []), [data, code, valid]);
  const text = code ? code.code : q;
  const inRepo = (i: { repo: string | null }) => !code?.repo || i.repo === code.repo;
  const visible = items.filter((i) => inFilter(i, valid) && inRepo(i) && matches(i, text));
  const visibleIdeas = ideas.filter((i) => inFilter(i, valid) && inRepo(i) && ideaMatches(i, text));
  const fresh = newDone(visible, seen, today);
  const lastWeek = visible.filter((i) => i.lane === 'done' && i.date! >= builtCutoff(today)).length;
  const counts = { ...laneCounts(visible, visibleIdeas), ...(searching ? {} : { done: fresh.length }) };
  // Marquee selection (BL-13): the selected items' Markdown in page order, grouped by project.
  const selection = useMemo(createSelectionStore, []);
  const marquee = useRef<HTMLDivElement>(null);
  const onMarquee = useMarqueeSelection(selection, marquee);
  const byKey = new Map(visible.map((i) => [i.key, i]));
  const copyText = (keys: ReadonlySet<string>) => {
    const order = [...document.querySelectorAll<HTMLElement>('[data-select-key]')].map((e) => e.dataset.selectKey!);
    return selectionText(order.filter((k) => keys.has(k)).flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])));
  };
  const markAll = () => {
    const next = markSeen(items, seen, fresh, today);
    saveSeen(next);
    setSeen(next);
  };
  const of = (k: Lane) => visible.filter((i) => i.lane === k);
  const unblock = unblockCount(visible);
  const groups = builtGroups(visible);

  return (
    <div className="board-page" onPointerDown={onMarquee}>
      <div ref={marquee} className="marquee" aria-hidden="true" data-testid="marquee" />
      <SelectionStyle store={selection} />
      <SelectionBar store={selection} text={copyText} />
      {code && <CodeBox query={code} hits={codeHits} />}
      <NumberStrip counts={counts} unblock={unblock} />
      <div className="board">
        <Lane k="stuck" count={counts.stuck} note={unblock > 0 && <span className="unblock-count" data-testid="lane-unblock"> · {unblockText(unblock)}</span>}>{grouped(of('stuck'))}</Lane>
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
                <NavLink key={g.key} className="ideas-group-row" testId="ideas-row" to={{ page: 'ideas', group: g.key, p: valid, q: '', sort }}>
                  <span className="group-name">{g.label}</span> <b>{g.ideas.length}</b> <span className="muted first-idea">{g.ideas[0]!.idea.text}</span>
                </NavLink>
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
            <NavLink to={{ page: 'built', p: valid, q: '', sort }}>Everything built</NavLink>
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
export function BuiltPage({ data, selected, sort }: { data: Data; selected: string[]; sort: SortKey }) {
  const items = boardItems(data, sort, null).filter((i) => i.lane === 'done' && inFilter(i, selected));
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
export function IdeasPage({ data, group, selected, sort }: { data: Data; group?: WhyKey; selected: string[]; sort: SortKey }) {
  const groups = ideaGroups(boardIdeas(data, sort).filter((i) => inFilter(i, selected)));
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

/** Everything below the header, for a given state (no fetching; tests render this directly). A search shows Home. */
export function View({ data, nav, go, now }: { data: Data; nav: Nav; go: (n: Nav, replace?: boolean) => void; now?: Date }) {
  const repos = useMemo(() => sortProjects(data.projects.filter((p) => !p.noFiles), nav.sort).map((p) => p.repo), [data, nav.sort]);
  const place = shownPlace(nav);
  const selected = hasProjects(place) ? resolveProjects(nav.p, repos) : [];
  const page =
    place === 'projects' ? (
      <ProjectsPage data={data} nav={nav} go={go} />
    ) : place === 'ideas' ? (
      <IdeasPage data={data} group={nav.group} selected={selected} sort={nav.sort} />
    ) : place === 'built' ? (
      <BuiltPage data={data} selected={selected} sort={nav.sort} />
    ) : (
      <Home data={data} q={nav.q} selected={selected} sort={nav.sort} now={now} />
    );
  return (
    <GoContext.Provider value={go}>
      <PageRows nav={nav} repos={repos} go={go} />
      {page}
    </GoContext.Provider>
  );
}

/** This tab's own trail of pages, kept in each history entry (for the header's ← → and their tooltips). */
interface Trail {
  bk: 1;
  idx: number;
  trail: string[];
}
const isTrail = (x: unknown): x is Trail => !!x && typeof x === 'object' && (x as Trail).bk === 1 && Number.isInteger((x as Trail).idx) && Array.isArray((x as Trail).trail);
const currentHash = () => location.hash;

export function App() {
  const [nav, setNav] = useState(() => parseHash(location.hash));
  const [trail, setTrail] = useState<Trail>(() => (isTrail(history.state) ? history.state : { bk: 1, idx: 0, trail: [navLabel(nav)] }));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = useOwnerState(data, setData);
  const cur = useRef(trail);
  cur.current = trail;

  useLayoutEffect(() => {
    if (!isTrail(history.state)) history.replaceState(trail, '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser's back / forward (and an address typed by hand, which gets a trail entry of its own).
  useLayoutEffect(() => {
    const pop = (e: PopStateEvent) => {
      const n = parseHash(location.hash);
      setNav(n);
      if (isTrail(e.state)) return setTrail(e.state);
      const c = cur.current;
      const next: Trail = { bk: 1, idx: c.idx + 1, trail: [...c.trail.slice(0, c.idx + 1), navLabel(n)] };
      history.replaceState(next, '');
      setTrail(next);
    };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);

  /** Every change of what's shown goes through here: a new history entry, or (typing a search) the same one. */
  const go = useCallback((n: Nav, replace = false) => {
    const href = hrefOf(n);
    const shown = parseHash(href);
    const c = cur.current;
    if (replace) {
      const next = { ...c, trail: c.trail.map((t, i) => (i === c.idx ? navLabel(shown) : t)) };
      history.replaceState(next, '', href);
      setTrail(next);
      setNav(shown);
      return;
    }
    if (href === currentHash()) return;
    const idx = c.idx + 1;
    const list = [...c.trail.slice(0, idx), navLabel(shown)];
    history.replaceState({ ...c, trail: list }, ''); // the page we leave learns where → goes
    const next: Trail = { bk: 1, idx, trail: list };
    history.pushState(next, '', href);
    cur.current = next;
    setTrail(next);
    setNav(shown);
    scrollTo(0, 0);
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
    document.title = titleOf(nav);
    saveSort(nav.sort);
  }, [nav]);

  // The address always spells out what's shown: project names as the site spells them (old #/p/ZULU → ?p=zulu),
  // Projects' order included.
  useEffect(() => {
    if (!data) return;
    const repos = data.projects.filter((p) => !p.noFiles).map((p) => p.repo);
    const canon = { ...nav, p: hasProjects(shownPlace(nav)) ? resolveProjects(nav.p, repos) : [] };
    const href = hrefOf(canon);
    if (href !== currentHash()) {
      history.replaceState(history.state, '', href);
      setNav(parseHash(href));
    }
  }, [data, nav]);

  const pageHistory: PageHistory = {
    back: trail.idx > 0 ? (trail.trail[trail.idx - 1] ?? 'the previous page') : undefined,
    forward: trail.trail[trail.idx + 1],
    onBack: () => history.back(),
    onForward: () => history.forward(),
  };

  return (
    <OwnerContext.Provider value={owner}>
      <Header
        nav={nav}
        data={data}
        history={pageHistory}
        go={go}
        end={
          <>
            <span className="muted stamp" title={data ? `Read from GitHub at ${data.generatedAt}` : 'Reading GitHub…'}>
              {data ? `read ${new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'reading…'}
            </span>
            <OwnerControl />
          </>
        }
      />
      <main>
        {error && <p className="error banner" role="alert">Could not load projects: {error}</p>}
        {!data && !error && <p className="muted">Reading GitHub…</p>}
        {data && (
          <>
            <Notices data={data} />
            <View data={data} nav={nav} go={go} />
          </>
        )}
      </main>
      <SiteVersion {...BUILD_INFO} />
    </OwnerContext.Provider>
  );
}
