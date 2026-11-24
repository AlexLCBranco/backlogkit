// Vercel requests are a budget (CLAUDE.md): after a push the live site gets only a small smoke check, and the wait for
// the new version checks at most every 30 s. Before this, CI ran every live e2e and polled every 10 s.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { POLL_MS, POLL_TRIES } from '../scripts/wait-live';

type Spec = { title: string; tags: string[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };
const specs = (s: Suite): Spec[] => [...(s.specs ?? []), ...(s.suites ?? []).flatMap(specs)];

/** The e2e tests Playwright would run, listed only (`--list` opens no page and sends no request). */
function listed(env: Record<string, string>) {
  const out = execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    env: { ...process.env, LIVE_URL: '', LIVE_FULL: '', ...env },
  });
  return specs(JSON.parse(out) as Suite);
}

describe('live budget', () => {
  it('wait-live checks the live version at most every 30 s, for about 10 minutes', () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(30_000);
    expect(POLL_MS * POLL_TRIES).toBeGreaterThanOrEqual(9 * 60_000);
  });

  it('with LIVE_URL set, only the @smoke tests run', () => {
    const live = listed({ LIVE_URL: 'https://example.invalid' });
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(5);
    for (const t of live) expect(t.tags, t.title).toContain('smoke');
  }, 60_000);

  it('locally every test runs, not just the smoke check', () => {
    expect(listed({}).length).toBeGreaterThan(20);
  }, 60_000);
});
