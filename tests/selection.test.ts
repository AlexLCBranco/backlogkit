// @vitest-environment jsdom
// BL-13: marquee selection — hit-testing the box against item rects, adding with a modifier, clearing, copy format.
import { describe, expect, it, vi } from 'vitest';
import { createSelectionStore, itemsTouching, nextSelection, selectionText, touches } from '../src/selection';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function page(rows: [string, DOMRect][]) {
  const root = document.createElement('div');
  for (const [key, r] of rows) {
    const el = document.createElement('div');
    el.dataset.selectKey = key;
    el.getBoundingClientRect = () => r;
    root.append(el);
  }
  const other = document.createElement('div'); // not an item: never selected
  other.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
  root.append(other);
  return root;
}

describe('hit-testing the box against item rects', () => {
  const root = page([
    ['a', rect(10, 10, 500, 30)],
    ['b', rect(10, 50, 500, 30)],
    ['c', rect(10, 90, 500, 30)],
    ['hidden', rect(10, 60, 0, 0)],
  ]);
  it('every item the box touches, in page order; edges touching count', () => {
    expect(itemsTouching(root, { left: 100, top: 45, right: 120, bottom: 95 })).toEqual(['b', 'c']);
    expect(itemsTouching(root, { left: 100, top: 40, right: 120, bottom: 41 })).toEqual(['a']); // a ends at 40
    expect(itemsTouching(root, { left: 600, top: 0, right: 700, bottom: 200 })).toEqual([]); // beside the items
  });
  it('an empty box touches nothing; hidden items never count', () => {
    expect(touches({ left: 5, top: 5, right: 5, bottom: 50 }, rect(0, 0, 10, 10))).toBe(false);
    expect(itemsTouching(root, { left: 0, top: 0, right: 1000, bottom: 1000 })).toEqual(['a', 'b', 'c']);
  });
});

describe('modifiers and clearing', () => {
  it('a plain drag replaces the selection; Shift/Ctrl + drag adds to it', () => {
    expect(nextSelection(['c'], ['a', 'b'], false)).toEqual(['c']);
    expect(nextSelection(['b', 'c'], ['a', 'b'], true)).toEqual(['a', 'b', 'c']);
  });
  it('the store notifies only on a real change, and clear empties it', () => {
    const s = createSelectionStore();
    const seen = vi.fn();
    s.subscribe(seen);
    s.set(['a', 'b']);
    s.set(['b', 'a']); // same set: no notification
    expect(seen).toHaveBeenCalledTimes(1);
    expect([...s.get()]).toEqual(['a', 'b']);
    s.clear();
    expect(s.get().size).toBe(0);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe('copy format', () => {
  it("each item's own copy text, in the order given, grouped by project", () => {
    expect(
      selectionText([
        { repo: 'demo', markdown: '### DM-1 — First\nSpec.' },
        { repo: 'other', markdown: '### OT-1 — Other' },
        { repo: 'demo', markdown: '- DM-5 — Built (v1.3.0)\n  What changed.' },
      ]),
    ).toBe('## demo\n\n### DM-1 — First\nSpec.\n\n- DM-5 — Built (v1.3.0)\n  What changed.\n\n## other\n\n### OT-1 — Other\n');
  });
});
