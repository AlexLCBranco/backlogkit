// Marquee selection on the home page (BL-13), with the same rules as the owner's other apps (a trimmed port of
// calendarkit's src/components/selection.ts): drag past a 4 px threshold to draw a box; every item line it touches is
// selected (highlighted) while dragging; Shift or Ctrl + drag adds to the selection; a click on empty space or Esc
// clears it; a plain click on an item still opens it (no drag, no selection). Controls, chips and links never start a
// marquee (they, and anything marked data-no-marquee, keep their own job). While something is selected a small bar
// shows "N selected · Copy · Clear"; Copy (and Ctrl+C) copies the selected items as Markdown, in page order, grouped
// by project. Mouse only: touch keeps scrolling.
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** The selected item keys, outside React state so a change re-renders only its subscribers (highlight, bar). */
export interface SelectionStore {
  get(): ReadonlySet<string>;
  /** Replaces the selection; no-op (and no notification) when the set is unchanged. */
  set(keys: Iterable<string>): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export function createSelectionStore(): SelectionStore {
  let current = EMPTY;
  const listeners = new Set<() => void>();
  const store: SelectionStore = {
    get: () => current,
    set(keys) {
      const next = new Set(keys);
      if (next.size === current.size && [...next].every((k) => current.has(k))) return;
      current = next.size ? next : EMPTY;
      listeners.forEach((l) => l());
    },
    clear: () => store.set([]),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

export const useSelection = (store: SelectionStore) => useSyncExternalStore(store.subscribe, store.get, store.get);

/** Pointer travel (px) before a press becomes a marquee; less is a click. */
export const MARQUEE_THRESHOLD = 4;
/** Selectable item lines: planned items and built items. */
export const ITEM = '[data-select-key]';
/** A press on any of these keeps doing its own job instead of starting a marquee. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [data-no-marquee]';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Do two boxes overlap (edges touching counts)? An empty box touches nothing. */
export const touches = (a: Box, b: Box) => a.left < a.right && a.top < a.bottom && a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/** Keys of the items in `root` whose box the marquee `box` touches (client px). Hidden items (no size) never count. */
export function itemsTouching(root: ParentNode, box: Box): string[] {
  const keys: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(ITEM)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (touches(box, r)) keys.push(el.dataset.selectKey!);
  }
  return keys;
}

/** The marquee's next selection: what it touches, plus what was selected before when adding (Shift/Ctrl). */
export const nextSelection = (touched: string[], before: Iterable<string>, additive: boolean) => (additive ? [...new Set([...before, ...touched])] : touched);

/**
 * The selected items as text, in the order given (page order), grouped by project: "## <repo>" and each item's
 * Markdown as its own copy button copies it, a blank line between.
 */
export function selectionText(items: { repo: string; markdown: string }[]): string {
  const by = new Map<string, string[]>();
  for (const i of items) by.set(i.repo, [...(by.get(i.repo) ?? []), i.markdown]);
  return [...by].map(([repo, list]) => `## ${repo}\n\n${list.join('\n\n')}`).join('\n\n') + '\n';
}

/** The `onPointerDown` for the selectable area. `box` is the (fixed-position) marquee element. */
export function useMarqueeSelection(store: SelectionStore, box: RefObject<HTMLDivElement | null>) {
  return function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const area = event.currentTarget;
    const boxEl = box.current;
    const target = event.target;
    if (!boxEl || event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse') return;
    if (!(target instanceof Element) || !area.contains(target) || target.closest(INTERACTIVE)) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const before = [...store.get()];
    const pressedItem = target.closest(ITEM);
    // The start point stays on the page content when the page scrolls under the box.
    const start = { x: event.clientX + scrollX, y: event.clientY + scrollY };
    const pointer = { x: event.clientX, y: event.clientY };
    const previousUserSelect = document.body.style.userSelect;
    let drawing = false;
    let frame = 0;

    function update() {
      frame = 0;
      const sx = start.x - scrollX;
      const sy = start.y - scrollY;
      const rect = { left: Math.min(sx, pointer.x), right: Math.max(sx, pointer.x), top: Math.min(sy, pointer.y), bottom: Math.max(sy, pointer.y) };
      boxEl!.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      boxEl!.style.width = `${rect.right - rect.left}px`;
      boxEl!.style.height = `${rect.bottom - rect.top}px`;
      store.set(nextSelection(itemsTouching(area, rect), before, additive));
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    function handlePointerMove(e: PointerEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!drawing) {
        if (Math.hypot(pointer.x + scrollX - start.x, pointer.y + scrollY - start.y) < MARQUEE_THRESHOLD) return;
        drawing = true;
        area.setPointerCapture(event.pointerId);
        document.body.style.userSelect = 'none'; // no text highlight under the box
        window.getSelection()?.removeAllRanges();
        boxEl!.style.display = 'block';
      }
      schedule();
    }
    const handleScroll = () => drawing && schedule();
    function finish() {
      area.removeEventListener('pointermove', handlePointerMove);
      area.removeEventListener('pointerup', handlePointerUp);
      area.removeEventListener('pointercancel', finish);
      window.removeEventListener('scroll', handleScroll, true);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
      document.body.style.userSelect = previousUserSelect;
      boxEl!.style.display = 'none';
    }
    function handlePointerUp() {
      if (drawing) update(); // the last position counts
      finish();
      if (drawing && pressedItem) {
        // the click that ends a drag started on an item must not open it (only that click)
        const swallow = (e: MouseEvent) => {
          if (!(e.target instanceof Node) || !area.contains(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
      if (!drawing && !additive && !pressedItem) store.clear(); // a click on empty space
    }
    area.addEventListener('pointermove', handlePointerMove);
    area.addEventListener('pointerup', handlePointerUp);
    area.addEventListener('pointercancel', finish);
    window.addEventListener('scroll', handleScroll, true);
  };
}

/** "N selected · Copy · Clear" while something is selected; Ctrl+C copies, Esc clears. */
export function SelectionBar({ store, text }: { store: SelectionStore; text: (keys: ReadonlySet<string>) => string }) {
  const keys = useSelection(store);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copy = () =>
    navigator.clipboard.writeText(text(store.get())).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  const copyRef = useRef(copy);
  copyRef.current = copy;
  useEffect(() => {
    if (!keys.size) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape') store.clear();
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copyRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keys.size, store]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!keys.size) return null;
  return (
    <div className="selbar" role="toolbar" aria-label="Selection" data-no-marquee data-testid="selection-bar">
      <span className="selbar-count" data-testid="selection-count">
        {keys.size} selected
      </span>
      <button type="button" onClick={() => void copy()} data-testid="copy-selection" data-copied={copied || undefined} title="Copy the selected items (Ctrl+C)">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button type="button" onClick={() => store.clear()} data-testid="clear-selection" title="Clear the selection (Esc)">
        Clear
      </button>
    </div>
  );
}

/** The selected items' highlight: one generated style rule, so selecting re-renders no item. */
export function SelectionStyle({ store }: { store: SelectionStore }) {
  const keys = useSelection(store);
  if (!keys.size) return null;
  const sel = [...keys].map((k) => `[data-select-key="${CSS.escape(k)}"]`).join(',\n');
  return <style data-testid="selection-style">{`${sel} { outline: 2px solid var(--accent); outline-offset: -1px; background-color: rgba(122, 162, 255, 0.14); }`}</style>;
}
