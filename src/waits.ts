// Stuck items that wait for another item (BL-21). A `Blocked:` line can name the item it waits for ("waits for HT-1").
// The site looks every named ID up in every repo's lists and says, in plain words, whether it has shipped. When every
// named ID has shipped the stuck item is "ready to go again" (BL-24: Stuck shows it in its own group, with a ✓/⏳ checklist
// and an Unstick button that fills in the owner's answer box). The site only edits a repo when the owner saves.
import type { Data } from './types';

const ID_IN_TEXT = /\b[A-Z]{1,4}-\d+[a-z]?\b/g;

/** The item IDs written in a Blocked note (letters, a dash, a number), each once, in order; the item's own ID left out. */
export function blockedIds(note: string | null | undefined, ownId: string | null = null): string[] {
  const found = String(note ?? '').match(ID_IN_TEXT) ?? [];
  return [...new Set(found)].filter((id) => id !== ownId);
}

/** Where an ID is written: every built line (repo + day), every plan and every ideas list (repo null = unassigned). */
export interface CodePlaces {
  built: { repo: string; date: string }[];
  planned: string[];
  ideas: (string | null)[];
  /** BL-24: what the item is, per repo (its "In short" sentence, else its title); repo null = unassigned idea. */
  about: { repo: string | null; text: string }[];
  /** BL-24: the Blocked note of a planned item that is itself stuck, per repo. */
  stuck: { repo: string; note: string }[];
}
export type CodeIndex = Map<string, CodePlaces>;

/** Every ID in every repo's lists (the lists the site already reads). */
export function codeIndex(data: Data): CodeIndex {
  const index: CodeIndex = new Map();
  const at = (id: string | null) => {
    if (!id) return null;
    if (!index.has(id)) index.set(id, { built: [], planned: [], ideas: [], about: [], stuck: [] });
    return index.get(id)!;
  };
  for (const p of data.projects) {
    for (const s of p.planned)
      if (s.kind !== 'other')
        for (const i of s.items) {
          const c = at(i.id);
          if (!c) continue;
          c.planned.push(p.repo);
          c.about.push({ repo: p.repo, text: i.short ?? i.title });
          if (i.blocked) c.stuck.push({ repo: p.repo, note: i.blockedNote?.text ?? '' });
        }
    for (const d of p.built)
      for (const i of d.items) {
        at(i.id)?.built.push({ repo: p.repo, date: d.date });
        at(i.id)?.about.push({ repo: p.repo, text: i.title.replace(/\s*\(v\d[^)]*\).*$/, '') }); // "Title (v1.0.0) (took …)" → "Title"
      }
    for (const i of p.ideas) {
      at(i.id)?.ideas.push(p.repo);
      at(i.id)?.about.push({ repo: p.repo, text: i.text });
    }
  }
  for (const i of data.unassigned.ideas) {
    at(i.id)?.ideas.push(null);
    at(i.id)?.about.push({ repo: null, text: i.text });
  }
  return index;
}

export type WaitState = 'shipped' | 'planned' | 'idea' | 'missing';
/** One named ID and what the lists say about it. repo null: not found, or an idea with no project yet. */
export interface WaitRef {
  id: string;
  state: WaitState;
  repo: string | null;
  /** The day it is listed under in BUILT.md (shipped only). */
  date: string | null;
  /** BL-24: what it is, in plain words (its "In short" sentence or title); null when not found. */
  about?: string | null;
  /** BL-24: a planned item that is itself stuck, and everything it waits for has shipped: unstick it first. */
  stuckReady?: boolean;
}
export interface Waits {
  refs: WaitRef[];
  /** Every named ID has shipped: this can be unblocked. */
  ready: boolean;
  /** What the card says, one sentence per line. */
  lines: string[];
  /** The note asks the owner something (it has a "?"): it never unblocks itself, even when every named ID has shipped. */
  question?: boolean;
}

/** A Blocked note that asks the owner something. One that only names items ("waits for footykit FK-76") has no "?". */
export const asksOwner = (note: string | null | undefined): boolean => String(note ?? '').includes('?');

/** Ideas are numbered per repo (I-1 is in many), so an ID found in several repos means the stuck item's own repo first. */
const pick = <T>(list: T[], repoOf: (x: T) => string | null, own: string): T => list.find((x) => repoOf(x) === own) ?? list[0]!;

const aboutOf = (places: CodePlaces, repo: string | null) => places.about.find((a) => a.repo === repo)?.text ?? null;

/** BL-24: a stuck planned item whose own Blocked note names IDs that have all shipped (one level down only). */
function stuckButReady(id: string, repo: string, index: CodeIndex): boolean {
  const note = index.get(id)?.stuck.find((s) => s.repo === repo)?.note;
  if (note === undefined) return false;
  const ids = blockedIds(note, id);
  return !asksOwner(note) && ids.length > 0 && ids.every((x) => (index.get(x)?.built.length ?? 0) > 0);
}

export function waitRef(id: string, ownRepo: string, index: CodeIndex): WaitRef {
  const places = index.get(id);
  if (places?.built.length) {
    const b = pick(places.built, (x) => x.repo, ownRepo);
    return { id, state: 'shipped', repo: b.repo, date: b.date, about: aboutOf(places, b.repo) };
  }
  if (places?.planned.length) {
    const repo = pick(places.planned, (x) => x, ownRepo);
    return { id, state: 'planned', repo, date: null, about: aboutOf(places, repo), stuckReady: stuckButReady(id, repo, index) };
  }
  if (places?.ideas.length) {
    const repo = pick(places.ideas, (x) => x, ownRepo);
    return { id, state: 'idea', repo, date: null, about: aboutOf(places, repo) };
  }
  return { id, state: 'missing', repo: null, date: null, about: null };
}

const refText = (r: WaitRef): string =>
  r.state === 'shipped'
    ? `${r.id} has shipped (${r.repo}, ${r.date})`
    : r.state === 'planned'
      ? `Still waiting for ${r.id} (planned in ${r.repo})`
      : r.state === 'idea'
        ? `Still waiting for ${r.id} (${r.repo ? `an idea in ${r.repo}` : 'an idea with no project yet'}, not planned)`
        : `${r.id} was not found in any project`;

/** The sentences for a stuck card. All shipped: the last one ends with "this can be unblocked". */
export function waitLines(refs: WaitRef[]): string[] {
  const lines = refs.map(refText);
  if (!refs.length || refs.some((r) => r.state !== 'shipped')) return lines;
  if (refs.length === 1) return [`${lines[0]}: this can be unblocked`];
  return [...lines, 'All of them have shipped: this can be unblocked'];
}

/** What a stuck item waits for; null when its Blocked note names no other item (nothing changes on its card). */
export function waitsFor(note: string | null | undefined, ownId: string | null, ownRepo: string, index: CodeIndex): Waits | null {
  const refs = blockedIds(note, ownId).map((id) => waitRef(id, ownRepo, index));
  if (!refs.length) return null;
  return waitsOf(refs, note);
}

/** Waits from the looked-up IDs. A note with a question is never ready: it needs the owner's answer first. */
export function waitsOf(refs: WaitRef[], note: string | null | undefined): Waits {
  const shipped = refs.every((r) => r.state === 'shipped');
  if (!asksOwner(note)) return { refs, ready: shipped, lines: waitLines(refs) };
  const lines = refs.map(refText);
  return { refs, ready: false, question: true, lines: shipped ? [...lines, 'It still needs your answer to its question'] : lines };
}

/** Stuck items that can be unblocked come first; every other item keeps its place. */
export function unblockFirst<T extends { waits: Waits | null }>(items: T[]): T[] {
  return [...items.filter((i) => i.waits?.ready), ...items.filter((i) => !i.waits?.ready)];
}

// BL-24: Stuck in three groups, a checklist per card, and the Unstick text.
export type StuckGroup = 'ready' | 'waiting' | 'answer';
export const STUCK_GROUPS: { key: StuckGroup; label: string; help: string }[] = [
  { key: 'ready', label: 'Ready to go again', help: 'Everything these waited for is done. They go back in the plan by themselves at the next build. Or press Unstick now.' },
  { key: 'waiting', label: 'Still waiting', help: "These wait for something that isn't built yet." },
  { key: 'answer', label: 'Needs your answer', help: 'These need you to decide something. Press Answer.' },
];
/** Which group a stuck item is in: all it names has shipped → ready; names something else → waiting; names nothing, or asks the owner something ("?") → answer. */
export const stuckGroup = (w: Waits | null): StuckGroup => (!w || w.question ? 'answer' : w.ready ? 'ready' : 'waiting');

/** Ready to go again first, then Still waiting, then Needs your answer; each group keeps the order it had. */
export function stuckGroups<T extends { waits: Waits | null }>(items: T[]) {
  return STUCK_GROUPS.map((g) => ({ ...g, items: items.filter((i) => stuckGroup(i.waits) === g.key) }));
}

/** The words after the Stuck number: "3 ready to go again · 1 still waiting" (parts that are 0 left out); '' when none. */
export function stuckSummary(items: { waits: Waits | null }[]): string {
  const ready = items.filter((i) => stuckGroup(i.waits) === 'ready').length;
  const waiting = items.filter((i) => stuckGroup(i.waits) === 'waiting').length;
  return [ready && `${ready} ready to go again`, waiting && `${waiting} still waiting`].filter(Boolean).join(' · ');
}
export const readyText = (n: number) => `${n} ready to go again`;

/** One "Waits for:" row: the mark, the line, its colour, and what the waited item is (small grey text). */
export interface CheckRow {
  id: string;
  mark: '✓' | '⏳' | '✕';
  tone: 'ok' | 'wait' | 'bad';
  text: string;
  about: string | null;
  /** A planned item that is itself stuck but ready: the repo of the card to scroll to. */
  unstickFirst: string | null;
}
export function checkRow(r: WaitRef): CheckRow {
  const base = { id: r.id, about: r.about ?? null, unstickFirst: null };
  if (r.state === 'shipped') return { ...base, mark: '✓', tone: 'ok', text: `${r.id} — ${r.repo} — built ${r.date}` };
  if (r.state === 'planned')
    return r.stuckReady
      ? { ...base, mark: '⏳', tone: 'wait', text: `${r.id} — ${r.repo} — is stuck but ready: unstick it first`, unstickFirst: r.repo }
      : { ...base, mark: '⏳', tone: 'wait', text: `${r.id} — ${r.repo} — planned, not built yet` };
  if (r.state === 'idea')
    return { ...base, mark: '⏳', tone: 'wait', text: `${r.id} — ${r.repo ? `an idea in ${r.repo}` : 'an idea with no project yet'}, not planned yet` };
  return { ...base, mark: '✕', tone: 'bad', text: `${r.id} — not found in any project` };
}

/** What the answer box holds when Unstick opens it. */
export function unstickText(w: Waits): string {
  return `Everything it waited for is built: ${w.refs.map((r) => `${r.id} (${r.repo}, ${r.date})`).join(', ')}.`;
}

/** The id of a stuck card on the page, so an "unstick it first" row can scroll to it. */
export const stuckCardId = (repo: string, id: string) => `stuck-${repo}-${id}`;
