// @vitest-environment jsdom
// BL-23: Build order. Rounds, the order inside a round, "Needs you", loops, Held, and the page itself.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { View } from '../src/App';
import { hrefOf, parseHash, titleOf, WHERE } from '../src/nav';
import { LOOP_NOTE, buildMinutes, buildOrder, filterOrder, orderCompare, orderText, roundLabel, type BuildOrder, type OrderItem, type PileRow } from '../src/order';
import type { Data } from '../src/types';
import { orderData } from './order-fixtures';

let data: Data;
let o: BuildOrder;
beforeAll(async () => {
  data = await orderData();
  o = buildOrder(data);
});
afterEach(cleanup);

const ids = (list: OrderItem[]) => list.map((i) => i.id);
const pile = (rows: PileRow[]) => rows.map((r) => `${'>'.repeat(r.depth)}${r.item.id}`);
const find = (id: string) => [...o.rounds.flat(), ...o.needsYou.map((r) => r.item), ...o.held.map((r) => r.item)].find((i) => i.id === id)!;

describe('rounds', () => {
  it('a chain of 3 takes 3 rounds; two items waiting for one come after it; a link crosses repos', () => {
    expect(ids(o.rounds[0]!)).toContain('AL-1');
    expect(ids(o.rounds[1]!)).toEqual(['AL-2', 'BE-2', 'BE-3', 'BE-4']); // AL-2 opens AL-3, so it is first
    expect(ids(o.rounds[2]!)).toEqual(['AL-3']);
    expect(o.rounds).toHaveLength(3);
    expect(find('BE-4').after).toEqual(['AL-1']); // beta waits for alpha
    expect(find('BE-1').opens).toEqual(['BE-2', 'BE-3']);
    expect(find('AL-1').opens).toEqual(['AL-2', 'AL-21', 'BE-4']);
  });
  it('a shipped ID is no longer a link: the item is in round 1 and can be unblocked', () => {
    expect(ids(o.rounds[0]!)).toContain('BE-5');
    expect(find('BE-5')).toMatchObject({ after: [], waits: { ready: true, lines: ['GA-1 has shipped (gamma, 2026-11-20): this can be unblocked'] } });
    expect(find('BE-3').after).toEqual(['BE-1']); // GA-1 shipped, BE-1 not
  });
  it('every item is in exactly one place', () => {
    const all = [...o.rounds.flat(), ...o.needsYou.map((r) => r.item), ...o.held.map((r) => r.item)].map((i) => i.key);
    expect(all).toHaveLength(23);
    expect(new Set(all).size).toBe(23);
  });
  it('says each round in plain words', () => {
    expect([1, 2, 3].map(roundLabel)).toEqual(['Build these now', 'Build these after round 1', 'Build these after round 2']);
  });
});

describe('order inside a round', () => {
  it('most waited-for first (down the whole chain), then shorter estimate, then repo, then ID', () => {
    // AL-1: AL-2, AL-3, BE-4, AL-21 wait for it (4). BE-1: 2. Then estimates 5 (beta), 5 (gamma), 30; then none: BE-5, BE-10.
    expect(ids(o.rounds[0]!)).toEqual(['AL-1', 'BE-1', 'BE-8', 'GA-2', 'BE-9', 'BE-5', 'BE-10']);
    expect(find('AL-1').weight).toBe(4);
    expect(find('BE-1').weight).toBe(2);
  });
  it('a range counts as its middle; no estimate, or an unreadable one, goes last', () => {
    expect(buildMinutes(find('BE-9').estimate)).toBe(30);
    expect(buildMinutes(null)).toBe(Infinity);
    expect(buildMinutes({ raw: 'soon', build: null, suite: null, ok: false })).toBe(Infinity);
    const item = (over: Partial<OrderItem>): OrderItem => ({ ...find('BE-10'), ...over });
    const e = (min: number, max: number) => ({ raw: '', build: { min, max }, suite: null, ok: true });
    expect(orderCompare(item({ estimate: e(40, 60) }), item({ estimate: e(45, 45) }))).toBeGreaterThan(0); // 50 after 45
    expect(orderCompare(item({ weight: 1 }), item({ estimate: e(1, 1) }))).toBeLessThan(0); // waited-for beats a short estimate
    expect(orderCompare(item({ repo: 'a' }), item({ repo: 'b' }))).toBeLessThan(0);
    expect(orderCompare(item({ id: 'BE-9' }), item({ id: 'BE-10' }))).toBeLessThan(0); // 9 before 10
  });
});

describe('Needs you', () => {
  it('a Blocked line with no ID is there with its text; items that wait for it go under it, never in a round', () => {
    expect(pile(o.needsYou)).toEqual(['AL-4', '>AL-5', '>>AL-6', 'AL-8', '>AL-10', 'AL-9', 'AL-7', 'BE-6']);
    expect(find('AL-4').blockedText).toBe('the owner picks a colour.');
    for (const id of ['AL-4', 'AL-5', 'AL-6']) expect(ids(o.rounds.flat())).not.toContain(id);
  });
  it('an ID found nowhere, and an idea that is not planned', () => {
    expect(find('AL-7').waits!.refs).toMatchObject([{ id: 'ZZ-9', state: 'missing' }]);
    expect(find('BE-6').note).toBe('Waits for an idea that is not planned yet: I-1');
  });
  it('a loop: both are there with the note, what waits for them goes under, and it ends', () => {
    expect(find('AL-8').note).toBe(LOOP_NOTE);
    expect(find('AL-9').note).toBe(LOOP_NOTE);
    expect(find('AL-10').note).toBeNull();
    expect(find('AL-8').weight).toBe(2); // AL-9 and AL-10, not itself
  });
  it('a loop of three, and an item naming only itself, never hang', async () => {
    const d = await orderData({
      loop: {
        'FEATURE_BACKLOG.md':
          '## Ready\n\n### LP-1 — A\nBlocked: waits for LP-2.\n\n### LP-2 — B\nBlocked: waits for LP-3.\n\n### LP-3 — C\nBlocked: waits for LP-1.\n\n### LP-4 — D\nBlocked: LP-4 needs an answer.\n\n### LP-5 — E\n',
      },
    });
    const x = buildOrder(d);
    expect(pile(x.needsYou)).toEqual(['LP-1', 'LP-2', 'LP-3', 'LP-4']);
    expect(ids(x.rounds.flat())).toEqual(['LP-5']);
  });
});

describe('Held', () => {
  it('Held items stay out of the rounds, in their own pile; a Ready item that waits for one goes under it', () => {
    expect(pile(o.held)).toEqual(['AL-20', '>BE-7', 'AL-21']);
    for (const id of ['AL-20', 'AL-21', 'BE-7']) expect(ids(o.rounds.flat())).not.toContain(id);
  });
});

describe('project chips and Copy order', () => {
  it('chips hide the other projects; round numbers stay', () => {
    const f = filterOrder(o, ['alpha']);
    expect(f.rounds.map(ids)).toEqual([['AL-1'], ['AL-2'], ['AL-3']]);
    expect(pile(f.held)).toEqual(['AL-20', 'AL-21']);
    expect(filterOrder(o, ['gamma']).rounds.map(ids)).toEqual([['GA-2'], [], []]);
    expect(filterOrder(o, [])).toBe(o);
  });
  it('the copied text: one line per item: round, ID, repo, title', () => {
    const lines = orderText(o.rounds).split('\n');
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('Round 1 · AL-1 · alpha · Base');
    expect(lines[7]).toBe('Round 2 · AL-2 · alpha · Second');
    expect(lines[11]).toBe('Round 3 · AL-3 · alpha · Third');
  });
});

describe('the page', () => {
  const show = (hash: string) => render(<View data={data} nav={parseHash(hash)} go={() => {}} />);
  const rowIds = (el: HTMLElement) => within(el).getAllByTestId('order-row').map((r) => r.dataset.id);
  it('is a place in the header with its own address and title', () => {
    expect(WHERE.map((w) => w.label)).toEqual(['Home', 'Projects', 'Ideas', 'Built', 'Build order']);
    expect(WHERE.length).toBeLessThanOrEqual(5); // NAV_PATTERN.md: at most 5
    expect(parseHash('#/order?p=alpha')).toMatchObject({ page: 'order', p: ['alpha'] });
    expect(hrefOf(parseHash('#/order?p=alpha'))).toBe('#/order?p=alpha');
    expect(titleOf(parseHash('#/order'))).toBe('backlogkit · Build order');
  });
  it('shows the rounds in plain words, then Needs you, then Waiting for your go', () => {
    show('#/order');
    const rounds = screen.getAllByTestId('order-round');
    expect(rounds.map((r) => r.querySelector('h3')!.textContent)).toEqual(['Round 1 Build these now 7', 'Round 2 Build these after round 1 4', 'Round 3 Build these after round 2 1']);
    expect(rowIds(rounds[0]!)).toEqual(ids(o.rounds[0]!));
    expect(screen.getByTestId('order-needs-you').querySelector('h2')!.textContent).toBe('Needs you 8');
    expect(screen.getByTestId('order-held').querySelector('h2')!.textContent).toBe('Waiting for your go 3');
  });
  it('a row: ID (opens the item), title, repo, the In short sentence, Opens and After', () => {
    show('#/order');
    const row = (id: string) => screen.getAllByTestId('order-row').find((r) => r.dataset.id === id)!;
    const al2 = row('AL-2');
    expect(within(al2).getByTestId('order-id').getAttribute('href')).toBe('#/?q=AL-2');
    expect(al2.querySelector('.order-title')!.textContent).toBe('Second');
    expect(within(al2).getByTestId('repo-label').textContent).toBe('alpha');
    expect(within(al2).getByTestId('order-short').textContent).toBe('Second in plain words.');
    expect(within(al2).getByTestId('order-opens').textContent).toBe('Opens: AL-3');
    expect(within(al2).getByTestId('order-after').textContent).toBe('After: AL-1');
    expect(within(row('BE-8')).queryByTestId('order-opens')).toBeNull();
    expect(within(row('BE-5')).getByTestId('order-unblock').textContent).toBe('GA-1 has shipped (gamma, 2026-11-20): this can be unblocked');
    expect(within(row('AL-4')).getByTestId('order-blocked').textContent).toBe('the owner picks a colour.');
    expect(row('AL-6').dataset.depth).toBe('2');
    expect(within(row('AL-8')).getByTestId('order-note').textContent).toBe(LOOP_NOTE);
    expect(within(row('BE-6')).getByTestId('order-note').textContent).toBe('Waits for an idea that is not planned yet: I-1');
    expect(within(row('AL-7')).getByTestId('order-note').textContent).toBe('ZZ-9 was not found in any project');
  });
  it('chips: only that project is shown; empty rounds are left out', () => {
    show('#/order?p=gamma');
    expect(screen.getAllByTestId('order-round').map((r) => r.querySelector('h3')!.textContent)).toEqual(['Round 1 Build these now 1']);
    expect(screen.getByTestId('order-needs-you').textContent).toContain('Nothing needs you.');
    expect(screen.getByTestId('order-held').textContent).toContain('Nothing waiting for your go.');
  });
});
