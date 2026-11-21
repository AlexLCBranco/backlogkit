import { describe, expect, it } from 'vitest';
import { WHY, builtSummary, counts, ideaMarkdown, splitIdea, parseBacklog, parseBuilt, parseBuiltDays, parseIdeas, parseShort, parseUnassignedIdeas } from '../lib/lists.mjs';
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
      { id: 'I-1', title: 'Dark mode toggle (2026-11-01)', text: 'Dark mode toggle', note: '2026-11-01', why: null, badWhy: null },
      { id: 'I-2', title: 'Something long that wraps (2026-11-02)', text: 'Something long that wraps', note: '2026-11-02', why: null, badWhy: null },
    ]);
  });
});

describe('idea reasons and end notes (BL-17)', () => {
  it('reads each tag, takes it off the shown text, keeps the full line in title', () => {
    for (const why of WHY) expect(parseIdeas(`- I-1 — Thing (2026-11-01) [why: ${why}]\n`)[0]).toMatchObject({ text: 'Thing', note: '2026-11-01', why, badWhy: null, title: `Thing (2026-11-01) [why: ${why}]` });
  });
  it('no tag → why null; an unknown tag → why null and badWhy set', () => {
    expect(parseIdeas('- I-1 — Thing\n')[0]).toMatchObject({ text: 'Thing', note: null, why: null, badWhy: null });
    expect(parseIdeas('- I-1 — Thing [why: someday]\n')[0]).toMatchObject({ text: 'Thing', why: null, badWhy: 'someday' });
  });
  it('a tag on a continued indented line', () => {
    expect(parseIdeas('- I-2 — Something long\n  that wraps (2026-11-02) [why: Too-Big]\n- I-3 — Next\n')).toMatchObject([
      { id: 'I-2', text: 'Something long that wraps', note: '2026-11-02', why: 'too-big' },
      { id: 'I-3', text: 'Next', why: null },
    ]);
  });
  it('the parenthesised note at the very end splits off; one in the middle stays', () => {
    expect(splitIdea('Use the (new) API (PLAN.md "Later list")')).toEqual({ text: 'Use the (new) API', note: 'PLAN.md "Later list"', why: null, badWhy: null });
    expect(splitIdea('Thing (2026-10-16, chat) [why: later]')).toEqual({ text: 'Thing', note: '2026-10-16, chat', why: 'later', badWhy: null });
    expect(splitIdea('(only a note)')).toEqual({ text: '(only a note)', note: null, why: null, badWhy: null });
  });
});

describe('parseUnassignedIdeas (BL-7)', () => {
  it('a missing file has none', () => {
    expect(parseUnassignedIdeas(null)).toEqual([]);
    expect(parseUnassignedIdeas(undefined)).toEqual([]);
  });
  it('an empty file, or one with only its header, has none', () => {
    expect(parseUnassignedIdeas('')).toEqual([]);
    // Only its header (not the real file: that one has ideas in it whenever the owner adds some).
    expect(parseUnassignedIdeas('# Unassigned ideas\n\nIdeas the owner mentioned that fit no repo yet. IDs are U-1, U-2, ... (never reused).\n')).toEqual([]);
  });
  it('reads U-n items, wrapped lines joined, CRLF too', () => {
    expect(parseUnassignedIdeas('# Unassigned\r\n\r\nText.\r\n\r\n- U-1 — One (2026-11-18)\r\n- U-2 — Two\r\n  wraps (2026-11-19)\r\n')).toMatchObject([
      { id: 'U-1', title: 'One (2026-11-18)' },
      { id: 'U-2', title: 'Two wraps (2026-11-19)' },
    ]);
  });
  it('ideaMarkdown gives the line back', () => {
    expect(ideaMarkdown({ id: 'U-1', title: 'One (2026-11-18)' })).toBe('- U-1 — One (2026-11-18)');
    expect(ideaMarkdown({ id: null, title: 'No id' })).toBe('- No id');
  });
});

describe('In short (BL-15)', () => {
  it('reads the first non-empty line under the heading into item.short', () => {
    const [ready] = parseBacklog('## Ready\n\n### X-1 — Title one\n\n**In short:** You see a new button.\nMore text.\n\n### X-2 — Title two\nText first.\n**In short:** Too late.\n\n### X-3 — Title three\n');
    expect(ready!.items.map((i) => i.short)).toEqual(['You see a new button.', null, null]);
  });
  it('parseShort: with, without, not first, empty', () => {
    expect(parseShort('**In short:** A sentence.  \r\nrest')).toBe('A sentence.');
    expect(parseShort('No summary here.')).toBeNull();
    expect(parseShort('Intro\n**In short:** later')).toBeNull();
    expect(parseShort('**In short:**   ')).toBeNull();
    expect(parseShort('')).toBeNull();
  });
});
