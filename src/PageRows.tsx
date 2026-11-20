// BL-19: the page rows under the pinned header (NAV_PATTERN.md §2), scrolling away with the page: What (which
// projects) as chips, never a <select>, and How (Projects' order) as small switches. A search shows its words here,
// editable, with a button to leave it. A page without a What or a How skips that row.
import type { ReactNode } from 'react';
import { hasProjects, resolveProjects, shownPlace, type Nav } from './nav';
import type { SortKey } from './sort';

/** A segmented switch (How). */
export function Switch<T extends string>({ value, options, onChange, label, testId }: { value: T; options: [T, string, string?][]; onChange: (v: T) => void; label: string; testId?: string }) {
  return (
    <div className="nv-tabs" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map(([v, text, tip]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`nv-tab${value === v ? ' nv-tab-on' : ''}`} data-text={text} title={tip} data-value={v} onClick={() => value !== v && onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const Row = ({ label, children, tip }: { label: string; children: ReactNode; tip: string }) => (
  <div className="nv-prow">
    <span className="nv-prow-label" title={tip}>
      {label}
    </span>
    {children}
  </div>
);

const FIELDS: [string, string, string][] = [
  ['backlog', 'Backlog changed', 'When its backlog file last changed'],
  ['push', 'Last change', 'When anything was last pushed to it'],
  ['created', 'Created', 'When the repo was made'],
  ['name', 'Name', 'Alphabetical'],
];

/** Projects' order as two switches: by what, and which way. */
function SortRow({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  const [field, dir] = sort.split('-') as [string, 'asc' | 'desc'];
  const dirs: ['asc' | 'desc', string][] = field === 'name' ? [['asc', 'A–Z'], ['desc', 'Z–A']] : [['desc', 'Newest first'], ['asc', 'Oldest first']];
  return (
    <>
      <Row label="How" tip="How the cards are ordered">
        <Switch label="Sort projects by" testId="sort-field" value={field} options={FIELDS} onChange={(f) => onSort(`${f}-${f === 'name' ? 'asc' : 'desc'}` as SortKey)} />
      </Row>
      <Switch label="Sort direction" testId="sort-dir" value={dir} options={dirs} onChange={(d) => onSort(`${field}-${d}` as SortKey)} />
    </>
  );
}

export function PageRows({ nav, repos, go }: { nav: Nav; repos: string[]; go: (n: Nav, replace?: boolean) => void }) {
  const place = shownPlace(nav);
  const q = nav.q.trim();
  const chosen = resolveProjects(nav.p, repos);
  const choose = (p: string[]) => go({ ...nav, page: place, p });
  return (
    <div className="nv-prows" data-testid="page-rows" data-no-marquee>
      <div className="nv-prows-line">
        {hasProjects(place) && (
          <Row label="What" tip="Which projects to show">
            <div className="nv-chips" role="group" aria-label="Filter by project" data-testid="what-projects">
              <button type="button" className="nv-chip" aria-pressed={!chosen.length} data-text="All projects" onClick={() => chosen.length && choose([])}>
                All projects
              </button>
              {repos.map((r) => {
                const on = chosen.includes(r);
                return (
                  <button key={r} type="button" className="nv-chip" aria-pressed={on} data-text={r} title={on ? `Stop showing ${r}` : `Show ${r}`} onClick={() => choose(on ? chosen.filter((x) => x !== r) : repos.filter((x) => x === r || chosen.includes(x)))}>
                    {r}
                  </button>
                );
              })}
            </div>
          </Row>
        )}
        {place === 'projects' && <SortRow sort={nav.sort} onSort={(sort) => go({ ...nav, sort })} />}
      </div>
      {q && (
        <div className="nv-prows-line">
          <Row label="Search" tip="Showing only what matches these words">
            <span className="nv-search">
              <input type="search" aria-label="Search" value={nav.q} onChange={(e) => go({ ...nav, q: e.target.value }, true)} data-testid="search" />
              <button type="button" className="nv-search-clear" aria-label="Leave the search" title="Leave the search" onClick={() => go({ ...nav, q: '' })} data-testid="search-clear">
                ×
              </button>
            </span>
          </Row>
        </div>
      )}
    </div>
  );
}
