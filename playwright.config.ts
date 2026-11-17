import { defineConfig } from '@playwright/test';

// Local: the built site (`vite preview`) with /api/projects answered by the tests from mocked GitHub data.
// LIVE_URL=https://… runs the same specs' live parts against the deployed site (real GitHub data).
const live = process.env.LIVE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: live || 'http://localhost:4190', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  webServer: live ? undefined : { command: 'npm run build && npm run preview', url: 'http://localhost:4190', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
