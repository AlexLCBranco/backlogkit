import { describe, expect, it } from 'vitest';
import { builtSummary, counts, parseBacklog, parseBuilt, parseBuiltDays, parseIdeas } from '../lib/lists.mjs';
import { BACKLOG, BUILT, IDEAS } from './fixtures';

describe('parseBacklog', () => {
  const sections = parseBacklog(BACKLOG);
  it('keeps the backlog sections in order, preamble left out', () => {
    expect(sections.map((s) => [s.name, s.kind])).toEqual([
      ['Ready', 'ready'],
      ['Held (needs the owner\'s "go")', 'held'],
    ]);
  });
  it('reads ID, title and the full multi-line text of each item', () => {
    const one = sections[0]!.items[0]!;
    expect(one).toMatchObject({ id: 'DM-1', title: 'First thing', blocked: false });
    expect(one.body).toBe('Line one of the spec.\n- a bullet\n  continued');
  });
  it('marks items with a Blocked: note', () => {
    expect(sections[0]!.items.map((i) => i.blocked)).toEqual([false, true]);
    expect(counts(sections, [])).toEqual({ ready: 2, held: 1, planned: 3, blocked: 1, ideas: 0 });
  });
  it('handles CRLF files and an empty Ready section', () => {
    const s = parseBacklog('# x\r\n\r\n## Ready\r\n\r\n## Held\r\n\r\n### AB-9 — Only held\r\nBody\r\n');
    expect(s[0]!.items).toEqual([]);
    expect(s[1]!.items[0]).toMatchObject({ id: 'AB-9', title: 'Only held', body: 'Body' });
  });
});

describe('parseBuiltDays', () => {
  const days = parseBuiltDays(BUILT);
  it('puts the newest day first, whatever the file order', () => {
    expect(days.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
  });
  it('leaves "### Internal" out', () => {
    expect(JSON.stringify(days)).not.toContain('housekeeping');
    expect(days[0]!.items).toHaveLength(2);
  });
  it('reads ID, title, detail and version', () => {
    expect(days[0]!.items[0]).toMatchObject({ id: 'DM-5', title: 'Newest thing (v1.3.0)', detail: 'What the owner sees now.', version: '1.3.0' });
    expect(days[0]!.items[1]).toMatchObject({ id: null, version: '1.2.1' });
    expect(days[1]!.items[0]!.version).toBe('1.2.0');
  });
  it('latest version and date come from the newest entry that has them', () => {
    expect(builtSummary(days)).toEqual({ latestVersion: '1.3.0', latestBuiltDate: '2026-11-17' });
    expect(builtSummary(parseBuiltDays('## 2026-01-02\n- no version\n\n## 2026-01-01\n- old (v0.9.0)\n'))).toEqual({ latestVersion: '0.9.0', latestBuiltDate: '2026-01-02' });
    expect(builtSummary([])).toEqual({ latestVersion: null, latestBuiltDate: null });
    const noVersions = 'No version numbers here: package.json stays 0.1.0.\n\n## 2026-11-17\n- GT-4 — Notes\n\n## 2026-11-01\n- v1.65.1: a pinned copy\n';
    expect(builtSummary(parseBuiltDays(noVersions), noVersions)).toEqual({ latestVersion: null, latestBuiltDate: '2026-11-17' });
  });
  it("keeps gauntlet's old shape for the all-repos generator", () => {
    expect(parseBuilt(BUILT)['2026-11-17']).toEqual(['DM-5 — Newest thing (v1.3.0) What the owner sees now.', 'A fix without ID (v1.2.1)']);
  });
});

describe('parseIdeas', () => {
  it('reads I-n ideas, joining wrapped lines', () => {
    expect(parseIdeas(IDEAS)).toEqual([
      { id: 'I-1', title: 'Dark mode toggle (2026-11-01)' },
      { id: 'I-2', title: 'Something long that wraps (2026-11-02)' },
    ]);
  });
});
