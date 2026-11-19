// BL-11: the text edits behind the one-click moves.
import { describe, expect, it } from 'vitest';
import { ALREADY_ANSWERED, answerBlocked, cutIdea, heldToReady, idPrefix, ideaToHeld, nextId } from '../lib/moves.mjs';
import { parseBacklog, parseBlocked, parseIdeas } from '../lib/lists.mjs';
import { BACKLOG, BUILT, IDEAS } from './fixtures';

describe('ID numbering', () => {
  it("finds the repo's prefix from its backlog and built list, never an idea prefix", () => {
    expect(idPrefix(BACKLOG, BUILT)).toBe('DM');
    expect(idPrefix('## Ready\n', '- BL-3 — x (v1.0.0)\n- I-9 — y\n')).toBe('BL');
    expect(idPrefix('## Ready\n', '# Built\n')).toBeNull();
  });
  it('is one more than the highest ID anywhere in the backlog or built list (never reused)', () => {
    expect(nextId('DM', BACKLOG, BUILT)).toBe('DM-6'); // DM-5 is built
    expect(nextId('BL', 'see BL-11 split', '- BL-12 — x')).toBe('BL-13');
  });
});

describe('idea → Next (Held)', () => {
  it('cuts the idea (with its continuation line) and adds it at the bottom of Held with a From line', () => {
    const out = ideaToHeld({ ideasText: IDEAS, ideaId: 'I-2', backlog: BACKLOG, built: BUILT });
    expect(out.id).toBe('DM-6');
    expect(out.title).toBe('Something long that wraps');
    expect(parseIdeas(out.ideas).map((i) => i.id)).toEqual(['I-1']);
    expect(out.ideas).not.toContain('that wraps');
    const held = parseBacklog(out.backlog).find((s) => s.kind === 'held')!;
    expect(held.items.map((i) => i.id)).toEqual(['DM-3', 'DM-6']);
    expect(held.items[1]!.body).toBe('From I-2 (2026-11-02)');
    expect(out.backlog.endsWith('### DM-6 — Something long that wraps\nFrom I-2 (2026-11-02)\n')).toBe(true);
    // Ready and everything else untouched
    expect(out.backlog.replace(/\n\n### DM-6[\s\S]*$/, '\n')).toBe(BACKLOG);
  });
  it('adds a Held section at the end when there is none; Held stays above any later section', () => {
    const out = ideaToHeld({ ideasText: IDEAS, ideaId: 'I-1', backlog: '## Ready\n\n### DM-1 — a\n', built: '' });
    expect(out.backlog).toBe('## Ready\n\n### DM-1 — a\n\n## Held\n\n### DM-2 — Dark mode toggle\nFrom I-1 (2026-11-01)\n');
    const two = ideaToHeld({ ideasText: IDEAS, ideaId: 'I-1', backlog: '## Held\n\n### DM-1 — a\n\n\n## Notes\nx\n', built: '' });
    expect(two.backlog).toBe('## Held\n\n### DM-1 — a\n\n### DM-2 — Dark mode toggle\nFrom I-1 (2026-11-01)\n\n## Notes\nx\n');
  });
  it('keeps CRLF files CRLF', () => {
    const out = ideaToHeld({ ideasText: IDEAS.replace(/\n/g, '\r\n'), ideaId: 'I-1', backlog: BACKLOG.replace(/\n/g, '\r\n'), built: BUILT });
    expect(out.backlog).not.toMatch(/[^\r]\n/);
    expect(out.ideas).not.toMatch(/[^\r]\n/);
  });
  it('refuses plainly: unknown idea, no backlog file, no ID prefix', () => {
    expect(() => ideaToHeld({ ideasText: IDEAS, ideaId: 'I-9', backlog: BACKLOG, built: BUILT })).toThrow(/I-9 is not in the ideas file/);
    expect(() => ideaToHeld({ ideasText: IDEAS, ideaId: 'I-1', backlog: null, built: BUILT })).toThrow(/no FEATURE_BACKLOG.md/);
    expect(() => ideaToHeld({ ideasText: IDEAS, ideaId: 'I-1', backlog: '## Ready\n', built: '' })).toThrow(/ID prefix is unknown/);
  });
  it('cutIdea removes only that idea', () => {
    expect(cutIdea('# U\n\n- U-1 — a (2026-11-18)\n- U-2 — b\n', 'U-1').ideas).toBe('# U\n\n- U-2 — b\n');
  });
});

describe('Next → Now (Held → Ready)', () => {
  it('moves the item with its whole spec to the bottom of Ready', () => {
    const out = heldToReady({ backlog: BACKLOG, id: 'DM-3' });
    const s = parseBacklog(out.backlog);
    expect(s.find((x) => x.kind === 'ready')!.items.map((i) => i.id)).toEqual(['DM-1', 'DM-2', 'DM-3']);
    expect(s.find((x) => x.kind === 'held')!.items).toEqual([]);
    expect(s.find((x) => x.kind === 'ready')!.items[2]!.body).toBe('Held text.');
    expect(out.backlog).toContain("Blocked: waiting for the owner's colour choice.\n\n### DM-3 — Later thing\nHeld text.\n\n## Held");
  });
  it('only moves items that are under Held', () => {
    expect(() => heldToReady({ backlog: BACKLOG, id: 'DM-1' })).toThrow(/DM-1 is not under Held/);
    expect(() => heldToReady({ backlog: '## Held\n\n### X-1 — a\n', id: 'X-1' })).toThrow(/no "## Ready"/);
  });
});

describe('answering a Blocked note (BL-16)', () => {
  const answer = (backlog: string, id = 'X-1', a = 'Blue.') => answerBlocked({ backlog, id, answer: a, date: '2026-11-19' }).backlog;
  const B = (note: string, after = '') => `## Ready\n\n### X-1 — One\n**In short:** s.\n${note}\n${after}\n### X-2 — Two\nBlocked: other item.\n`;
  it('plain, one line', () => {
    expect(answer(B('Blocked: which colour?'))).toBe(B('**Answered (2026-11-19):** which colour? → Blue.'));
  });
  it('bold, and after "- "', () => {
    expect(answer(B('**Blocked:** which colour?'))).toBe(B('**Answered (2026-11-19):** which colour? → Blue.'));
    expect(answer(B('- **Blocked:** which colour?'))).toBe(B('**Answered (2026-11-19):** which colour? → Blue.'));
  });
  it('several lines become one; the next **Field:** line and the other item are kept', () => {
    const before = B('Blocked: which colour\n  for the header (2026-11-18)?', '**Estimate:** build ~5 min · suite ~1 min\n');
    const after = B('**Answered (2026-11-19):** which colour for the header (2026-11-18)? → Blue.', '**Estimate:** build ~5 min · suite ~1 min\n');
    expect(answer(before)).toBe(after);
    expect(parseBacklog(answer(before))[0]!.items.map((i) => i.blocked)).toEqual([false, true]);
  });
  it('the answer is put on one line; CRLF files keep CRLF', () => {
    expect(answer(B('Blocked: q?'), 'X-1', '  line one\n line two ')).toContain('q? → line one line two\n');
    expect(answer(B('Blocked: q?').replace(/\n/g, '\r\n'))).toBe(B('**Answered (2026-11-19):** q? → Blue.').replace(/\n/g, '\r\n'));
  });
  it('refuses: no Blocked note any more, no such item, empty answer', () => {
    expect(() => answer(B('Plain text.'))).toThrow(ALREADY_ANSWERED);
    expect(() => answer(B('Blocked: q?'), 'X-9')).toThrow(/X-9 is not in FEATURE_BACKLOG.md/);
    expect(() => answer(B('Blocked: q?'), 'X-1', '   ')).toThrow(/Type an answer first/);
  });
  it('parseBlocked reads the question and its date', () => {
    expect(parseBlocked('x\n**Blocked:** waiting on the key (2026-11-18)\n  and more\n**Estimate:** y')).toEqual({ text: 'waiting on the key (2026-11-18) and more', date: '2026-11-18' });
    expect(parseBlocked('- Blocked: plain')).toEqual({ text: 'plain', date: null });
    expect(parseBlocked('nothing')).toBeNull();
    expect(parseBacklog(B('Blocked: q?'))[0]!.items[0]!.blockedNote).toEqual({ text: 'q?', date: null });
  });
});
