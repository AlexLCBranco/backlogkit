import { describe, expect, it } from 'vitest';
import { backlogMarkdown, itemMarkdown, parseBacklog, parseBuiltDays } from '../lib/lists.mjs';
import { BACKLOG, BUILT } from './fixtures';

describe('copy Markdown (BL-3)', () => {
  const sections = parseBacklog(BACKLOG);

  it('one item: its heading line and full spec text, as in the file', () => {
    expect(itemMarkdown(sections[0]!.items[0]!)).toBe('### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued');
  });

  it('keeps the heading exactly as written (dash style, no ID)', () => {
    const [s] = parseBacklog('## Ready\n\n### GT-5 – Slate step 5: odd dash\nText.\n\n### No ID here\n');
    expect(itemMarkdown(s!.items[0]!)).toBe('### GT-5 – Slate step 5: odd dash\nText.');
    expect(itemMarkdown(s!.items[1]!)).toBe('### No ID here');
  });

  it('whole backlog: Ready and Held with their headings, other sections and the preamble left out', () => {
    expect(backlogMarkdown(sections)).toBe(
      '## Ready\n\n### DM-1 — First thing\nLine one of the spec.\n- a bullet\n  continued\n\n### DM-2 — Stuck thing\nNeeds a decision.\nBlocked: waiting for the owner\'s colour choice.\n\n## Held (needs the owner\'s "go")\n\n### DM-3 — Later thing\nHeld text.\n',
    );
    expect(backlogMarkdown(parseBacklog('## Notes\n\n### X-1 — not planned\n'))).toBe('');
    expect(backlogMarkdown([])).toBe('');
  });

  it('a built item copies as its lines in BUILT.md', () => {
    const items = parseBuiltDays(BUILT).flatMap((d) => d.items);
    expect(items.find((i) => i.id === 'DM-5')!.markdown).toBe('- DM-5 — Newest thing (v1.3.0)\n  What the owner sees now.');
    expect(items.find((i) => i.id === 'DM-0')!.markdown).toBe('- DM-0 — Older thing (v1.1.0)');
  });
});
