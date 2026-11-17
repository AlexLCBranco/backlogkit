// /api/projects for the local e2e: built with the real loader from mocked GitHub (tests/fixtures.ts).
import { loadAll } from '../lib/github.mjs';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from '../tests/fixtures';

export async function fixtureData() {
  const { fetchImpl } = mockGithub({
    repos: [{ name: 'demo' }, { name: 'broken', private: true }, { name: 'bare' }],
    files: { demo: { 'FEATURE_BACKLOG.md': BACKLOG, 'BUILT.md': BUILT, 'IDEAS.md': IDEAS } },
    fails: { broken: 403 },
    projectsJson: projectsJson([
      { repo: 'demo', description: 'Demo app', url: 'https://demo.vercel.app', status: 'active', devices: ['desktop'] },
      { repo: 'broken', description: 'Locked away', url: null, status: 'active', devices: ['desktop'] },
    ]),
  });
  return loadAll({ token: 'e2e-secret-token-value', fetchImpl });
}
