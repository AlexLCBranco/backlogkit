// Fixture repos for BL-21: stuck items that wait for other items (built, planned, an idea, not found, nobody).
import { loadAll } from '../lib/github.mjs';
import type { Data } from '../src/types';
import { mockGithub, projectsJson } from './fixtures';

export const WAIT_FILES = {
  alpha: {
    'FEATURE_BACKLOG.md':
      '## Ready\n\n### AL-1 — Alpha waits for a person\nBlocked: the owner picks a colour.\n\n### AL-2 — Alpha waits for two\nBlocked: needs HT-1 and HT-2 first.\n\n### AL-3 — Alpha waits for a ghost\nBlocked: after HT-9 ships.\n',
  },
  footy: {
    'FEATURE_BACKLOG.md':
      '## Ready\n\n### FK-60 — Plain item\nText.\n\n## Held\n\n### FK-61 — Whistle at half time\nBlocked: FK-61 waits: the owner unblocks it once HT-1 ships.\n\n### FK-62 — Needs two built things\nBlocked: waits for HT-1 and HT-3.\n',
    'IDEAS.md': '- I-1 — A footy idea (2026-11-01)\n',
  },
  halftime: {
    'FEATURE_BACKLOG.md': '## Ready\n\n### HT-2 — Second half\nText.\n\n### HT-4 — Waits for an idea\nBlocked: only after I-1.\n',
    'BUILT.md': '## 2026-11-20\n- HT-1 — Half time timer (v1.0.0)\n\n## 2026-11-18\n- HT-3 — Kick off (v0.9.0)\n',
    'IDEAS.md': '- I-1 — A timer idea (2026-11-02)\n',
  },
};

export async function waitData(): Promise<Data> {
  const repos = Object.keys(WAIT_FILES);
  const { fetchImpl } = mockGithub({
    repos: repos.map((name) => ({ name })),
    files: WAIT_FILES,
    projectsJson: projectsJson(repos.map((repo) => ({ repo, description: null, url: null, status: 'active', devices: null }))),
  });
  return (await loadAll({ token: 'tok', fetchImpl })) as Data;
}
