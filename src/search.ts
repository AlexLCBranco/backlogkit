// The top bar's search: every planned, built and idea item of every repo whose ID or text matches. A query shaped
// like an ID ("BL-1") matches that ID only (not BL-10); anything else is a case-insensitive text match on ID,
// title and full text, every word required.
import type { Project } from './types';

export interface Hit {
  repo: string;
  kind: 'planned' | 'built' | 'idea';
  id: string | null;
  title: string;
  where: string; // the backlog section, or the built day
  text: string; // full text (planned body / built detail)
  blocked?: boolean;
}

const ID_QUERY = /^[A-Z]{1,4}-\d+[a-z]?$/i;

export function allItems(projects: Project[]): Hit[] {
  const out: Hit[] = [];
  for (const p of projects) {
    for (const s of p.planned) for (const i of s.items) out.push({ repo: p.repo, kind: 'planned', id: i.id, title: i.title, where: s.name, text: i.body, blocked: i.blocked });
    for (const d of p.built) for (const i of d.items) out.push({ repo: p.repo, kind: 'built', id: i.id, title: i.title, where: d.date, text: i.detail });
    for (const i of p.ideas) out.push({ repo: p.repo, kind: 'idea', id: i.id, title: i.title, where: 'Ideas', text: '' });
  }
  return out;
}

export function search(projects: Project[], query: string): Hit[] {
  const q = query.trim();
  if (!q) return [];
  const items = allItems(projects);
  if (ID_QUERY.test(q)) return items.filter((h) => h.id?.toLowerCase() === q.toLowerCase());
  const words = q.toLowerCase().split(/\s+/);
  return items.filter((h) => {
    const hay = `${h.id ?? ''} ${h.title} ${h.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
