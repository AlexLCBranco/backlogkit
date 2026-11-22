// Fixture repos for BL-23 (Build order): chains, a hub, a cross-repo link, a shipped link, a question, an unknown ID,
// an idea, a loop, Held items, and a Ready item that waits for a Held one.
import { loadAll } from '../lib/github.mjs';
import type { Data } from '../src/types';
import { mockGithub, projectsJson } from './fixtures';

const item = (id: string, title: string, ...lines: string[]) => `### ${id} — ${title}\n**In short:** ${title} in plain words.\n${lines.join('\n')}\n`;
const est = (t: string) => `**Estimate:** build ${t} · suite ~1 min`;

export const ORDER_FILES = {
  alpha: {
    'FEATURE_BACKLOG.md': [
      '## Ready\n',
      item('AL-1', 'Base', est('~10 min')),
      item('AL-2', 'Second', 'Blocked: waits for AL-1.'),
      item('AL-3', 'Third', 'Blocked: waits for AL-2.'),
      item('AL-4', 'Needs a colour', 'Blocked: the owner picks a colour.'),
      item('AL-5', 'After the colour', 'Blocked: waits for AL-4.'),
      item('AL-6', 'After after the colour', 'Blocked: waits for AL-5.'),
      item('AL-7', 'Ghost', 'Blocked: after ZZ-9 ships.'),
      item('AL-8', 'Loop one', 'Blocked: waits for AL-9.'),
      item('AL-9', 'Loop two', 'Blocked: waits for AL-8.'),
      item('AL-10', 'After the loop', 'Blocked: waits for AL-8.'),
      '## Held\n',
      item('AL-20', 'Held thing'),
      item('AL-21', 'Held and waiting', 'Blocked: waits for AL-1.'),
    ].join('\n'),
  },
  beta: {
    'FEATURE_BACKLOG.md': [
      '## Ready\n',
      item('BE-1', 'Hub', est('~30 min')),
      item('BE-2', 'Spoke one', 'Blocked: waits for BE-1.'),
      item('BE-3', 'Spoke two', 'Blocked: needs BE-1 and GA-1 first.'),
      item('BE-4', 'Across repos', 'Blocked: waits for alpha AL-1.'),
      item('BE-5', 'Free again', 'Blocked: waits for GA-1.'),
      item('BE-6', 'Waits for an idea', 'Blocked: only after I-1.'),
      item('BE-7', 'Waits for a held one', 'Blocked: waits for AL-20.'),
      item('BE-8', 'Quick', est('~5 min')),
      item('BE-9', 'A range', est('~20–40 min')),
      item('BE-10', 'No estimate'),
    ].join('\n'),
    'IDEAS.md': '- I-1 — A beta idea (2026-11-01)\n',
  },
  gamma: {
    'FEATURE_BACKLOG.md': ['## Ready\n', item('GA-2', 'Gamma quick', est('~5 min'))].join('\n'),
    'BUILT.md': '## 2026-11-20\n- GA-1 — Gamma built (v1.0.0)\n',
  },
};

export async function orderData(files: Record<string, Record<string, string>> = ORDER_FILES): Promise<Data> {
  const repos = Object.keys(files);
  const { fetchImpl } = mockGithub({
    repos: repos.map((name) => ({ name })),
    files,
    projectsJson: projectsJson(repos.map((repo) => ({ repo, description: null, url: null, status: 'active', devices: null }))),
  });
  return (await loadAll({ token: 'tok', fetchImpl })) as Data;
}
