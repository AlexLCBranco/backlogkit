// BL-20: a search that is exactly an item code ("CK-17", "ck17", "demo I-2", "U-1") is explained in a box above the
// results. Pure functions; the box is src/CodeBox.tsx.
import { boardIdeas, boardItems } from './board';
import type { Data } from './types';

export interface CodeQuery {
  /** The code as the lists spell it: "CK-17". */
  code: string;
  /** The repo typed next to it ("demo I-2"), as the site spells it; null = none typed. */
  repo: string | null;
}

export type CodeState = 'Planned' | 'Blocked' | 'Built' | 'Idea';

export interface CodeHit {
  key: string;
  code: string;
  title: string;
  /** null = an unassigned idea (UNASSIGNED_IDEAS.md). */
  repo: string | null;
  state: CodeState;
  /** Built items only. */
  version: string | null;
  date: string | null;
  /** The "In short" sentence (built: the description line); null = nobody wrote one. Ideas have none. */
  short: string | null;
  /** The item where it is written, on GitHub; null when the repo's address is not known. */
  href: string | null;
}

const WITH_DASH = /^([a-z]{1,4})-(\d+)([a-z]?)$/i;
const NO_DASH = /^([a-z]{1,4})(\d+)([a-z]?)$/i;

/** Every code prefix in use ("CK", "BL", "I", "U"), so "ck17" is a code but "ps5" stays a plain word. */
export function codePrefixes(data: Data): Set<string> {
  const out = new Set<string>();
  const add = (id: string | null) => {
    const m = id?.match(WITH_DASH);
    if (m) out.add(m[1]!.toUpperCase());
  };
  for (const i of boardItems(data, 'name-asc', null)) add(i.id);
  for (const i of boardIdeas(data, 'name-asc')) add(i.idea.id);
  return out;
}

/**
 * The code a search text is, or null when it is ordinary words. Case does not matter; the dash may be left out when
 * the letters are a prefix in use. A repo's name may sit before or after the code ("demo I-2").
 */
export function parseCode(text: string, repos: string[], prefixes: ReadonlySet<string>): CodeQuery | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return null;
  const code = (w: string) => {
    const m = w.match(WITH_DASH) ?? (NO_DASH.test(w) && prefixes.has(w.match(NO_DASH)![1]!.toUpperCase()) ? w.match(NO_DASH) : null);
    return m ? `${m[1]!.toUpperCase()}-${m[2]}${m[3]!.toLowerCase()}` : null;
  };
  const repo = (w: string) => repos.find((r) => r.toLowerCase() === w.toLowerCase()) ?? null;
  if (words.length === 1) {
    const c = code(words[0]!);
    return c ? { code: c, repo: null } : null;
  }
  const [a, b] = words as [string, string];
  if (repo(a) && code(b)) return { code: code(b)!, repo: repo(a) };
  if (repo(b) && code(a)) return { code: code(a)!, repo: repo(b) };
  return null;
}

/** GitHub's anchor for a Markdown heading: lower case, punctuation dropped, spaces to dashes. */
export const headingAnchor = (heading: string) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

/**
 * Every item with that code: planned, built and ideas, in page order. A code with no repo typed looks everywhere;
 * when several match (idea codes repeat across repos) and projects are chosen in the chips, those projects' win.
 */
export function lookupCode(data: Data, q: CodeQuery, selected: string[] = []): CodeHit[] {
  const same = (id: string | null) => id?.toLowerCase() === q.code.toLowerCase();
  const fileUrl = (repo: string | null, file: string) => {
    if (repo === null) return `https://github.com/${data.owner}/backlogkit/blob/main/${file}`;
    const g = data.projects.find((p) => p.repo === repo)?.github;
    return g ? `${g.url}/blob/${g.defaultBranch ?? 'main'}/${file}` : null;
  };
  const hits: CodeHit[] = [];
  for (const i of boardItems(data, 'name-asc', null)) {
    if (!same(i.id)) continue;
    const built = i.lane === 'done';
    const url = fileUrl(i.repo, built ? 'BUILT.md' : 'FEATURE_BACKLOG.md');
    hits.push({
      key: i.key,
      code: i.id!,
      title: built && i.version ? i.title.replace(/\s*\(v[\d.]+\)\s*$/, '') : i.title, // the version is in the state line
      repo: i.repo,
      state: built ? 'Built' : i.blocked ? 'Blocked' : 'Planned',
      version: i.version,
      date: i.date,
      short: (built ? i.body : i.short) || null,
      href: url && !built ? `${url}#${headingAnchor(`${i.id} — ${i.title}`)}` : url,
    });
  }
  for (const i of boardIdeas(data, 'name-asc')) {
    if (!same(i.idea.id)) continue;
    hits.push({
      key: i.key,
      code: i.idea.id!,
      title: i.idea.text,
      repo: i.repo,
      state: 'Idea',
      version: null,
      date: null,
      short: null,
      href: fileUrl(i.repo, i.repo === null ? 'UNASSIGNED_IDEAS.md' : 'IDEAS.md'),
    });
  }
  if (q.repo) return hits.filter((h) => h.repo === q.repo);
  const chosen = hits.filter((h) => h.repo !== null && selected.includes(h.repo));
  return hits.length > 1 && chosen.length ? chosen : hits;
}

/** The line shown when nothing has that code. */
export const missingText = (q: CodeQuery) => `No feature has the code ${q.code}${q.repo ? ` in ${q.repo}` : ''}`;

/** "Built · v1.3.0 · 2026-11-17"; a part nobody wrote down is a dash. */
export function stateText(h: Pick<CodeHit, 'state' | 'version' | 'date'>): string {
  if (h.state !== 'Built') return h.state;
  return `Built · ${h.version ? `v${h.version}` : '—'} · ${h.date ?? '—'}`;
}
