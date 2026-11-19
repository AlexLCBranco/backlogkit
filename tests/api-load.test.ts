// Every Vercel function loads under plain Node ES modules, as on Vercel: relative imports need their file extension
// there (Vite and Vitest resolve "./move" without one, so the other tests can't see this). v1.9.0 broke the live
// site this way.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('api functions load under plain Node', () => {
  for (const f of readdirSync('api').filter((x) => x.endsWith('.ts')))
    it(f, () => {
      const out = execFileSync(process.execPath, ['-e', `import('./api/${f}').then(() => console.log('ok'), (e) => console.log(e.code ?? '', e.message))`], { encoding: 'utf8' });
      expect(out.trim()).toBe('ok');
    });
});
