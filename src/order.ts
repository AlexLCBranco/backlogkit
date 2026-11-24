// Build order (BL-23): every repo's planned items in the order to build them.
//   Rounds          "## Ready" items. Round 1 waits for nothing unshipped; round 2 waits only for round 1; and so on.
//   Needs you       Ready items whose Blocked line names no item (a question), names an ID found nowhere, names an
//                   idea, or is in a loop. Ready items that wait for one of these go under it, indented.
//   Waiting for your go   every "## Held" item. Ready items that wait for one go under it, indented.
// Links are the item IDs in a `Blocked:` line, as BL-21 reads them (waits.ts); a shipped ID is no longer a link.
// Pure functions; the page is in OrderPage.tsx. The page only shows: it never edits a repo.
import type { Data, Estimate } from './types';
import { blockedIds, codeIndex, waitRef, waitsOf, type Waits } from './waits';

export interface OrderItem {
  key: string;
  repo: string;
  id: string | null;
  title: string;
  short: string | null;
  section: 'ready' | 'held';
  estimate: Estimate | null;
  /** The Blocked line's text; null when not blocked. */
  blockedText: string | null;
  /** BL-21's sentences for the IDs the Blocked line names; null when it names none. */
  waits: Waits | null;
  /** IDs of the planned items it waits for (not shipped yet), as written. */
  after: string[];
  /** IDs of the planned items that wait for it. */
  opens: string[];
  /** How many planned items wait for it, counting everything down the chain. */
  weight: number;
  /** Why it is in "Needs you" (an idea, a loop); null otherwise. */
  note: string | null;
}
/** A row in a pile: depth 0 = the item itself, 1+ = an item that waits for the row above it. */
export interface PileRow {
  item: OrderItem;
  depth: number;
}
export interface BuildOrder {
  rounds: OrderItem[][];
  needsYou: PileRow[];
  held: PileRow[];
}

export const LOOP_NOTE = 'These wait for each other: fix the Blocked lines';
export const ideaNote = (ids: string[]) => `Waits for an idea that is not planned yet: ${ids.join(', ')}`;
export const roundLabel = (n: number) => (n === 1 ? 'Build these now' : `Build these after round ${n - 1}`);

/** The build estimate as one number: the middle of a range (~40–60 min = 50); none or unreadable = last. */
export const buildMinutes = (e: Estimate | null): number => (e?.ok && e.build ? (e.build.min + e.build.max) / 2 : Infinity);

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
/** Inside a round: most waited-for first, then the shorter build estimate, then repo name, then ID (BL-9 before BL-10). */
export function orderCompare(a: OrderItem, b: OrderItem): number {
  const ea = buildMinutes(a.estimate);
  const eb = buildMinutes(b.estimate);
  return b.weight - a.weight || (ea === eb ? 0 : ea < eb ? -1 : 1) || byText(a.repo, b.repo) || byText(a.id ?? '￿', b.id ?? '￿') || byText(a.title, b.title);
}

interface Node {
  item: OrderItem;
  deps: Node[];
  dependents: Node[];
  /** Ready and needs the owner on its own: a question, an unknown ID, an idea (a loop is added later). */
  own: boolean;
}

export function buildOrder(data: Data): BuildOrder {
  const index = codeIndex(data);
  const nodes: Node[] = [];
  const byId = new Map<string, Node>();
  for (const p of data.projects) {
    let n = 0;
    for (const s of p.planned) {
      if (s.kind === 'other') continue;
      for (const i of s.items) {
        const item: OrderItem = { key: `${p.repo}:plan:${n++}`, repo: p.repo, id: i.id, title: i.title, short: i.short ?? null, section: s.kind, estimate: i.estimate, blockedText: i.blocked ? (i.blockedNote?.text ?? '') : null, waits: null, after: [], opens: [], weight: 0, note: null };
        const node: Node = { item, deps: [], dependents: [], own: false };
        nodes.push(node);
        if (i.id && !byId.has(`${p.repo}#${i.id}`)) byId.set(`${p.repo}#${i.id}`, node);
      }
    }
  }

  // Links: the IDs each Blocked line names.
  for (const node of nodes) {
    const it = node.item;
    if (it.blockedText === null) continue;
    const refs = blockedIds(it.blockedText, it.id).map((id) => waitRef(id, it.repo, index));
    if (refs.length) it.waits = waitsOf(refs, it.blockedText);
    for (const r of refs) {
      if (r.state !== 'planned') continue;
      const dep = byId.get(`${r.repo}#${r.id}`);
      if (!dep || dep === node || node.deps.includes(dep)) continue;
      node.deps.push(dep);
      dep.dependents.push(node);
      it.after.push(r.id);
      if (it.id) dep.item.opens.push(it.id);
    }
    const ideas = refs.filter((r) => r.state === 'idea').map((r) => r.id);
    if (ideas.length) it.note = ideaNote(ideas);
    node.own = !refs.length || ideas.length > 0 || refs.some((r) => r.state === 'missing');
  }

  // Everything that waits for a node, down the chain (a loop ends: each node is visited once).
  const downstream = (start: Node): Set<Node> => {
    const seen = new Set<Node>();
    const todo = [...start.dependents];
    while (todo.length) {
      const x = todo.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      todo.push(...x.dependents);
    }
    return seen;
  };
  const inLoop = new Set<Node>();
  for (const node of nodes) {
    const down = downstream(node);
    if (down.has(node)) {
      inLoop.add(node);
      node.item.note = LOOP_NOTE;
      down.delete(node);
    }
    node.item.weight = down.size;
  }

  // Ready items: a round, or under the item they wait for. Held items and "needs you" items head their pile.
  const isRoot = (n: Node) => n.item.section === 'held' || n.own || inLoop.has(n);
  const round = new Map<Node, number>();
  const parent = new Map<Node, Node>();
  let todo = nodes.filter((n) => !isRoot(n));
  for (let moved = true; moved && todo.length; ) {
    moved = false;
    const rest: Node[] = [];
    for (const n of todo) {
      const up = n.deps.find((d) => isRoot(d) || parent.has(d));
      if (up) parent.set(n, up);
      else if (n.deps.every((d) => round.has(d))) round.set(n, 1 + Math.max(0, ...n.deps.map((d) => round.get(d)!)));
      else {
        rest.push(n);
        continue;
      }
      moved = true;
    }
    todo = rest;
  }
  const stray = new Set(todo); // cannot happen (every loop is a root); kept so nothing is ever dropped

  const rounds: OrderItem[][] = [];
  for (const [n, r] of round) (rounds[r - 1] ??= []).push(n.item);
  for (const r of rounds) r.sort(orderCompare);

  const children = new Map<Node, Node[]>();
  for (const [n, up] of parent) children.set(up, [...(children.get(up) ?? []), n]);
  const pile = (roots: Node[]): PileRow[] => {
    const out: PileRow[] = [];
    const add = (n: Node, depth: number) => {
      out.push({ item: n.item, depth });
      for (const c of (children.get(n) ?? []).sort((a, b) => orderCompare(a.item, b.item))) add(c, depth + 1);
    };
    for (const n of roots.sort((a, b) => orderCompare(a.item, b.item))) add(n, 0);
    return out;
  };
  return {
    rounds,
    needsYou: pile(nodes.filter((n) => (isRoot(n) && n.item.section === 'ready') || stray.has(n))),
    held: pile(nodes.filter((n) => n.item.section === 'held')),
  };
}

/** Only the chosen projects' rows (empty = all); rounds keep their numbers, so a round can be empty. */
export function filterOrder(o: BuildOrder, selected: string[]): BuildOrder {
  if (!selected.length) return o;
  const keep = (i: OrderItem) => selected.includes(i.repo);
  return { rounds: o.rounds.map((r) => r.filter(keep)), needsYou: o.needsYou.filter((r) => keep(r.item)), held: o.held.filter((r) => keep(r.item)) };
}

/** "Copy order": the rounds as plain text, one line per item: round, ID, repo, title. */
export function orderText(rounds: OrderItem[][]): string {
  return rounds.flatMap((r, n) => r.map((i) => `Round ${n + 1} · ${i.id ?? '—'} · ${i.repo} · ${i.title}`)).join('\n');
}
