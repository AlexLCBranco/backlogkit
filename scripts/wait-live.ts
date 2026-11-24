// CI (live job): wait until the live site shows this commit's version, or a newer one. A newer one means a later push
// has already deployed over this one (several pushes in a row), which still contains this commit's work; waiting for
// the exact version then could never succeed. Exit 1 after ~10 minutes otherwise.
// Polls at most every 30 s: Vercel requests are a budget (CLAUDE.md).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isBumped } from './check-version';

/** Has the live site reached `want`? Same version, or a higher one. Unreadable → no. */
/** Time between checks of the live /version.json, and how many checks (~10 minutes). */
export const POLL_MS = 30_000;
export const POLL_TRIES = 20;

export const liveReached = (want: string, got: string | null) => !!got && /^\d+\.\d+\.\d+$/.test(got) && (got === want || isBumped(want, got));

async function main(url: string) {
  const want = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  let got: string | null = null;
  for (let i = 0; i < POLL_TRIES; i++) {
    try {
      const r = await fetch(`${url}/version.json`, { cache: 'no-store' });
      got = ((await r.json()) as { version?: string }).version ?? null;
    } catch {
      got = null;
    }
    if (liveReached(want, got)) return console.log(`live site at ${got} (wanted ${want} or newer)`);
    await new Promise((ok) => setTimeout(ok, POLL_MS));
  }
  console.log(`live site still at ${got}, wanted ${want} or newer`);
  process.exitCode = 1; // not process.exit(): exiting while fetch's handles close crashes Node on Windows
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.LIVE_URL;
  if (!url) throw new Error('LIVE_URL is not set');
  await main(url);
}
