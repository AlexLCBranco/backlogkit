// BL-19: the pinned header (NAV_PATTERN.md §1), the same on every page, in footykit's FK-65 look: back / forward and
// the breadcrumb (each part opens its siblings), "Go anywhere" (Ctrl+K) and the owner controls on the right, and under
// them the Where tabs. It never changes height and never hides on scroll; the page rows under it scroll away.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { WHERE, crumbs, hrefOf, searchEntries, searchFind, shownPlace, whereTarget, type Crumb, type Nav, type Place } from './nav';
import { sortProjects } from './sort';
import type { Data } from './types';
import './nav.css';

export interface PageHistory {
  back?: string;
  forward?: string;
  onBack: () => void;
  onForward: () => void;
}

const ICONS: Record<Place, ReactNode> = {
  board: <path d="M2 7.2L8 2.2l6 5M3.6 6v7.8h3.2V10h2.4v3.8h3.2V6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  projects: <><rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /></>,
  ideas: <><path d="M8 1.8a4.3 4.3 0 00-2.6 7.7c.5.4.8 1 .8 1.6v.6h3.6v-.6c0-.6.3-1.2.8-1.6A4.3 4.3 0 008 1.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M6.3 14h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  built: <><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.2 8.2l2 2 3.7-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>,
};

/** Closes a popover on Escape or a click outside `box`. */
function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const f = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', f);
    document.addEventListener('keydown', f);
    return () => {
      document.removeEventListener('pointerdown', f);
      document.removeEventListener('keydown', f);
    };
  }, [open, box, close]);
}

function CrumbPart({ c, last, go }: { c: Crumb; last: boolean; go: (n: Nav) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useDismiss(open, box, () => setOpen(false));
  return (
    <span className="nv-crumb" ref={box} data-testid="crumb">
      <span className="nv-crumb-sep" aria-hidden="true">›</span>
      <button
        type="button"
        className={`nv-crumb-btn${last ? ' nv-crumb-last' : ''}`}
        aria-haspopup={c.items.length ? 'menu' : undefined}
        aria-expanded={c.items.length ? open : undefined}
        title={c.items.length ? `${c.label}: jump to another` : c.label}
        disabled={!c.items.length}
        onClick={() => setOpen((o) => !o)}
        data-testid="crumb-btn"
      >
        {c.label}
      </button>
      {open && (
        <span className="nv-crumb-menu" role="menu" data-testid="crumb-menu">
          {c.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`nv-crumb-item${it.on ? ' nv-crumb-item-on' : ''}`}
              aria-current={it.on || undefined}
              ref={it.on ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              onClick={() => {
                setOpen(false);
                if (!it.on) go(it.to);
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** "Go anywhere": Ctrl+K (⌘K) or the button; type, then Enter (or click) to jump. */
function GoAnywhere({ nav, data, repos, go }: { nav: Nav; data: Data | null; repos: string[]; go: (n: Nav) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const entries = useMemo(() => (open ? searchEntries(nav, data, repos) : []), [open, nav, data, repos]);
  const found = useMemo(() => (q.trim() ? searchFind(entries, q, nav) : searchFind(entries, '', nav)), [entries, q, nav]);
  const close = () => {
    setOpen(false);
    setQ('');
    setActive(0);
  };
  const pick = (i: number) => {
    const e = found[i];
    if (!e) return;
    close();
    go(e.to);
  };
  return (
    <>
      <button type="button" className="nv-go-btn" onClick={() => setOpen(true)} aria-label="Go anywhere (Ctrl+K)" title="Go anywhere: a page, a project, an item’s ID, or search everything (Ctrl+K)" data-testid="go-anywhere">
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.3 10.3l3.9 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="nv-go-text">Go anywhere</span>
        <kbd className="nv-go-kbd">Ctrl K</kbd>
      </button>
      {open && (
        <div className="nv-go-shade" data-no-marquee onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className="nv-go" role="dialog" aria-label="Go anywhere" data-testid="go-dialog">
            <input
              autoFocus
              className="nv-go-input"
              placeholder="Type a page, a project, an ID like BL-4, or any words…"
              value={q}
              spellCheck={false}
              autoComplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls="nv-go-list"
              aria-label="Where to go"
              data-testid="go-input"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, found.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  pick(active);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                }
              }}
            />
            <div className="nv-go-list" id="nv-go-list" role="listbox" data-testid="go-list">
              {found.map((e, i) => (
                <div
                  key={`${e.kind}|${e.label}`}
                  role="option"
                  aria-selected={i === active}
                  className={`nv-go-item${i === active ? ' nv-go-on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                  data-testid="go-item"
                >
                  <span className="nv-go-label">{e.label}</span>
                  <span className="muted nv-go-kind">{e.kind}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Header({ nav, data, history, go, end }: { nav: Nav; data: Data | null; history: PageHistory; go: (n: Nav) => void; end: ReactNode }) {
  const repos = useMemo(() => (data ? sortProjects(data.projects.filter((p) => !p.noFiles), nav.sort).map((p) => p.repo) : []), [data, nav.sort]);
  const parts = crumbs(nav, repos);
  const place = shownPlace(nav);
  const searching = !!nav.q.trim();
  return (
    <header className="nv-header" data-testid="top-bar" data-no-marquee>
      <div className="nv-head-row">
        <a className="nv-brand" href="#/" aria-label="backlogkit: Home" title="backlogkit: Home" onClick={(e) => { e.preventDefault(); go(whereTarget(nav, 'board')); }}>
          <img src="/logo.svg" alt="" width="20" height="20" data-testid="logo" />
        </a>
        <span className="nv-hist" role="group" aria-label="Page history" data-testid="page-history">
          <button type="button" className="nv-hist-btn" disabled={!history.back} title={history.back ? `Back to ${history.back}` : 'Nothing to go back to'} aria-label="Back" onClick={history.onBack} data-testid="back">
            ←
          </button>
          <button type="button" className="nv-hist-btn" disabled={!history.forward} title={history.forward ? `Forward to ${history.forward}` : 'Nothing to go forward to'} aria-label="Forward" onClick={history.onForward} data-testid="forward">
            →
          </button>
        </span>
        <nav className="nv-crumbs" aria-label="You are here" data-testid="breadcrumb">
          {parts.map((c, i) => (
            <CrumbPart key={`${i}|${c.label}`} c={c} last={i === parts.length - 1} go={go} />
          ))}
        </nav>
        <span className="nv-head-end">
          <GoAnywhere nav={nav} data={data} repos={repos} go={go} />
          {end}
        </span>
      </div>
      <nav className="nv-where" aria-label="Places" data-testid="where-tabs">
        {WHERE.map((w) => {
          const on = !searching && w.place === place;
          const to = whereTarget(nav, w.place);
          return (
            <a
              key={w.place}
              href={hrefOf(to)}
              className={`nv-where-tab${on ? ' nv-where-on' : ''}`}
              aria-current={on ? 'page' : undefined}
              title={w.tip}
              onClick={(e) => {
                e.preventDefault();
                go(to);
              }}
              data-testid={`where-${w.place}`}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                {ICONS[w.place]}
              </svg>
              <span className="nv-where-label" data-text={w.label}>{w.label}</span>
            </a>
          );
        })}
      </nav>
    </header>
  );
}
