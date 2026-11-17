import { describe, expect, it } from 'vitest';
import { changesNeedBump } from '../scripts/check-version';

describe('check-version', () => {
  it("the daily generated ALL_BUILT.md / ALL_BACKLOG.md and the lists don't need a version bump", () => {
    expect(changesNeedBump(['ALL_BUILT.md', 'ALL_BACKLOG.md', 'BUILT.md', 'scripts/all-built.mjs'])).toBe(false);
  });
  it('app files do', () => {
    expect(changesNeedBump(['src/App.tsx'])).toBe(true);
    expect(changesNeedBump(['lib/lists.mjs'])).toBe(true);
  });
});
