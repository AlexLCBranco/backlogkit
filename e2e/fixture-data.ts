// /api/projects for the local e2e: built with the real loader from mocked GitHub (tests/fixtures.ts).
import { loadAll } from '../lib/github.mjs';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from '../tests/fixtures';

export async function fixtureData() {
  const { fetchImpl } = mockGithub({
    repos: [
      { name: 'demo', backlog_changed: '2026-11-16T10:00:00Z', created_at: '2025-01-01T00:00:00Z' },
      { name: 'broken', private: true },
      { name: 'bare' },
      { name: 'alpha', backlog_changed: '2026-11-17T10:00:00Z', created_at: '2024-01-01T00:00:00Z' },
      { name: 'zulu', backlog_changed: '2026-11-10T10:00:00Z', created_at: '2026-06-01T00:00:00Z' },
    ],
    files: {
      demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS },
      alpha: { 'FEATURE_BACKLOG.md': '## Ready\n\n### AL-1 — Alpha item\nText.\n**Estimate:** build ~5 min · suite ~1 min\n\n### AL-2 — Odd estimate\n**Estimate:** soon-ish\n' },
      zulu: { 'FEATURE_BACKLOG.md': '## Ready\n\n### ZU-2 — A very long title that keeps going well past the width of a narrow window so it has to wrap onto a second line\nText.\n', 'BUILT.md': '# Built — zulu\n\n## 2026-11-12\n- ZU-1 — Timed thing (v0.2.0) (took 25 min, suite 4 min)\n','IDEAS.md': '# Ideas — zulu\n\nNone yet.\n' },
      backlogkit: { 'UNASSIGNED_IDEAS.md': '# Unassigned ideas\n\n- U-1 — Orphan gadget for no repo (2026-11-18)\n' },
    },
    fails: { broken: 403 },
    projectsJson: projectsJson([
      { repo: 'demo', description: 'Demo app', url: 'https://demo.vercel.app', status: 'active', devices: ['desktop'] },
      { repo: 'broken', description: 'Locked away', url: null, status: 'active', devices: ['desktop'] },
      { repo: 'alpha', description: 'First by name', url: null, status: 'active', devices: null },
      { repo: 'zulu', description: 'Last by name', url: null, status: 'active', devices: null },
    ]),
  });
  return loadAll({ token: 'e2e-secret-token-value', fetchImpl });
}
