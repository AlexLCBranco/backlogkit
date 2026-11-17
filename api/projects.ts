// GET /api/projects → every project with its lists (lib/github.mjs: loadAll), read live from GitHub. The token is the
// Vercel env var GITHUB_TOKEN (read-only, fine-grained); it stays on the server. Cached about a minute: in this
// function instance and at Vercel's edge (s-maxage), so a burst of visits makes one round of GitHub requests.

import { loadAll } from '../lib/github.mjs';

const TTL_MS = 60_000;
let cache: { at: number; body: string } | null = null;

export function clearCache() {
  cache = null;
}

export async function GET(): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' };
  if (cache && Date.now() - cache.at < TTL_MS) return new Response(cache.body, { headers });
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  try {
    let body = JSON.stringify(await loadAll({ token }));
    if (token && body.includes(token)) body = body.split(token).join('***'); // belt and braces: never send the token
    cache = { at: Date.now(), body };
    return new Response(body, { headers });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return Response.json({ error: token ? msg.split(token).join('***') : msg }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
