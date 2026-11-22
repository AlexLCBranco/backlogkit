// The Build order page (BL-23): rounds first, then "Needs you", then "Waiting for your go". Logic: order.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, ProjectLabel } from './App';
import { buildOrder, filterOrder, orderText, roundLabel, type OrderItem } from './order';
import type { SortKey } from './sort';
import type { Data } from './types';

const COPIED_MS = 1500;

/** Copies the rounds as plain text; says "Copied" for a moment. */
function CopyOrder({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="copy-order"
      data-testid="copy-order"
      data-copied={copied || undefined}
      disabled={!text}
      title="Copy the rounds as text: one line per item"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), COPIED_MS);
        })
      }
    >
      {copied ? 'Copied' : 'Copy order'}
    </button>
  );
}

/** One item. `why`: in a pile, also say why it is there (its Blocked text, a loop, an idea, an ID nobody has). */
function Row({ item, depth = 0, why = false, sort }: { item: OrderItem; depth?: number; why?: boolean; sort: SortKey }) {
  const missing = item.waits?.refs.filter((r) => r.state === 'missing') ?? [];
  return (
    <li className={`order-row${item.waits?.ready ? ' can-unblock' : ''}`} data-testid="order-row" data-id={item.id ?? ''} data-repo={item.repo} data-depth={depth} style={depth ? { marginLeft: depth * 26 } : undefined}>
      <div className="order-main">
        {item.id ? (
          <NavLink className="id" testId="order-id" to={{ page: 'board', p: [], q: item.id, sort }}>
            {item.id}
          </NavLink>
        ) : (
          <span className="id">—</span>
        )}
        <span className="order-title">{item.title}</span>
        <ProjectLabel repo={item.repo} />
      </div>
      {item.short ? (
        <div className="muted order-short" data-testid="order-short">{item.short}</div>
      ) : (
        <div className="order-short">
          <span className="badge no-summary" title="This spec has no “In short” line yet">no summary yet</span>
        </div>
      )}
      {item.opens.length > 0 && (
        <div className="order-link" data-testid="order-opens" title="When this is built, these can be built">
          Opens: {item.opens.join(', ')}
        </div>
      )}
      {item.after.length > 0 && (
        <div className="order-link" data-testid="order-after" title="These must be built before this one">
          After: {item.after.join(', ')}
        </div>
      )}
      {item.waits?.ready && (
        <div className="waits ready" data-testid="order-unblock">
          {item.waits.lines.map((l) => (
            <span key={l} className="waits-line">{l}</span>
          ))}
        </div>
      )}
      {why && depth === 0 && item.blockedText && <div className="blocked-note" data-testid="order-blocked">{item.blockedText}</div>}
      {why && item.note && <div className="order-note" data-testid="order-note">{item.note}</div>}
      {why && missing.map((r) => <div key={r.id} className="order-note" data-testid="order-note">{r.id} was not found in any project</div>)}
    </li>
  );
}

export function OrderPage({ data, selected, sort }: { data: Data; selected: string[]; sort: SortKey }) {
  const all = useMemo(() => buildOrder(data), [data]);
  const o = filterOrder(all, selected);
  const anyRound = o.rounds.some((r) => r.length);
  return (
    <div className="order-page" data-testid="order-page">
      <section className="order-box">
        <h2>
          Build order <CopyOrder text={orderText(o.rounds)} />
        </h2>
        <p className="muted order-help">Start at round 1. An item in round 2 needs something from round 1 first.</p>
        {!anyRound && <p className="muted empty">Nothing to build right now.</p>}
        {o.rounds.map((items, n) =>
          items.length ? (
            <div key={n} className="order-round" data-testid="order-round">
              <h3>
                Round {n + 1} <span className="muted round-label">{roundLabel(n + 1)}</span> <span className="muted count">{items.length}</span>
              </h3>
              <ol className="order-list">
                {items.map((i) => (
                  <Row key={i.key} item={i} sort={sort} />
                ))}
              </ol>
            </div>
          ) : null,
        )}
      </section>
      <section className="order-box" data-testid="order-needs-you">
        <h2>
          Needs you <span className="muted count">{o.needsYou.length}</span>
        </h2>
        <p className="muted order-help">These wait for you, not for another item. An item pushed to the right waits for the one above it.</p>
        {o.needsYou.length ? (
          <ul className="order-list">
            {o.needsYou.map((r) => (
              <Row key={r.item.key} item={r.item} depth={r.depth} why sort={sort} />
            ))}
          </ul>
        ) : (
          <p className="muted empty">Nothing needs you.</p>
        )}
      </section>
      <section className="order-box" data-testid="order-held">
        <h2>
          Waiting for your go <span className="muted count">{o.held.length}</span>
        </h2>
        <p className="muted order-help">These are not built until you say “go”. An item pushed to the right waits for the one above it.</p>
        {o.held.length ? (
          <ul className="order-list">
            {o.held.map((r) => (
              <Row key={r.item.key} item={r.item} depth={r.depth} why sort={sort} />
            ))}
          </ul>
        ) : (
          <p className="muted empty">Nothing waiting for your go.</p>
        )}
      </section>
    </div>
  );
}
