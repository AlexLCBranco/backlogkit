import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Site version: package.json's "version" (bumped with every app change; scripts/check-version.ts enforces it in CI),
// shown in the bottom-right corner, plus the commit it was built from. Both are in /version.json (no-cache, vercel.json).
const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7);
const dirty = !process.env.VERCEL_GIT_COMMIT_SHA && !process.env.GITHUB_SHA && git('status --porcelain') !== '';
const BUILD = { version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version, commit: sha ? `${sha}${dirty ? '+' : ''}` : 'dev', builtAt: new Date().toISOString() };

// `vite` (dev) runs the real function at /api/projects (GITHUB_TOKEN from the shell, if set). `vite preview` — what
// the e2e tests run against — has no function: the tests answer /api/projects themselves (page.route).
const api: Plugin = {
  name: 'projects-api',
  configureServer(server) {
    server.middlewares.use('/api/projects', async (_req, res) => {
      const { GET } = await server.ssrLoadModule('/api/projects.ts');
      const r: Response = await GET();
      res.statusCode = r.status;
      res.setHeader('content-type', 'application/json');
      res.end(await r.text());
    });
    server.middlewares.use('/api/move', async (req, res) => {
      const { POST } = await server.ssrLoadModule('/api/move.ts');
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const r: Response = await POST(new Request('http://localhost/api/move', { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
      res.statusCode = r.status;
      res.setHeader('content-type', 'application/json');
      res.end(await r.text());
    });
  },
};

export default defineConfig({
  plugins: [react(), api, { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) }); } }],
  define: { __APP_VERSION__: JSON.stringify(BUILD.version), __APP_COMMIT__: JSON.stringify(BUILD.commit), __BUILT_AT__: JSON.stringify(BUILD.builtAt) },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node' },
});
