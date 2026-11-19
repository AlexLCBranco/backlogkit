// CI's live job waits for this commit's version on the live site. When several pushes land in a row, a later one can
// deploy first; the old exact-match wait then failed although the site had this commit's work (CI run for v1.10.0
// failed with "live site still at 1.12.0, wanted 1.10.0").
import { describe, expect, it } from 'vitest';
import { liveReached } from '../scripts/wait-live';

describe('wait-live', () => {
  it('the same version counts', () => {
    expect(liveReached('1.10.0', '1.10.0')).toBe(true);
  });
  it('a newer live version counts (a later push deployed first)', () => {
    expect(liveReached('1.10.0', '1.12.0')).toBe(true);
    expect(liveReached('1.9.1', '1.10.0')).toBe(true); // numbers, not text
    expect(liveReached('1.10.0', '2.0.0')).toBe(true);
  });
  it('an older or unreadable live version does not', () => {
    expect(liveReached('1.10.0', '1.9.1')).toBe(false);
    expect(liveReached('1.10.0', null)).toBe(false);
    expect(liveReached('1.10.0', 'oops')).toBe(false);
  });
});
