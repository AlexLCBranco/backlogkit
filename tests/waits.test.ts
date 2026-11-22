// BL-21: stuck items say when the thing they wait for has shipped.
import { beforeAll, describe, expect, it } from 'vitest';
import { boardItems, projectUnblockCount, unblockCount } from '../src/board';
import { blockedIds, codeIndex, unblockFirst, waitLines, waitsFor, type CodeIndex } from '../src/waits';
import type { Data } from '../src/types';
import { waitData } from './wait-fixtures';

let data: Data;
let index: CodeIndex;
beforeAll(async () => {
  data = await waitData();
  index = codeIndex(data);
});

describe('IDs found in a Blocked line', () => {
  it('none, one, several; the own ID is left out; each ID once', () => {
    expect(blockedIds('the owner picks a colour.', 'AL-1')).toEqual([]);
    expect(blockedIds(null, 'AL-1')).toEqual([]);
    expect(blockedIds('the owner unblocks it once HT-1 ships', 'FK-61')).toEqual(['HT-1']);
    expect(blockedIds('FK-61 waits: once HT-1 ships', 'FK-61')).toEqual(['HT-1']);
    expect(blockedIds('needs HT-1, CK-17b and HT-1 again (2026-11-21)', 'FK-61')).toEqual(['HT-1', 'CK-17b']);
    expect(blockedIds('no lowercase ht-1, no date 2026-11-21', null)).toEqual([]);
  });
});

describe('what the card says', () => {
  const say = (note: string, id = 'FK-61', repo = 'footy') => waitsFor(note, id, repo, index);
  it('every named ID shipped: it can be unblocked, with the project and the day it is listed under', () => {
    expect(say('once HT-1 ships')).toMatchObject({ ready: true, lines: ['HT-1 has shipped (halftime, 2026-11-20): this can be unblocked'] });
    expect(say('waits for HT-1 and HT-3')).toMatchObject({
      ready: true,
      lines: ['HT-1 has shipped (halftime, 2026-11-20)', 'HT-3 has shipped (halftime, 2026-11-18)', 'All of them have shipped: this can be unblocked'],
    });
  });
  it('some shipped, some not: says which; not ready', () => {
    expect(say('needs HT-1 and HT-2 first')).toMatchObject({ ready: false, lines: ['HT-1 has shipped (halftime, 2026-11-20)', 'Still waiting for HT-2 (planned in halftime)'] });
  });
  it('still planned', () => {
    expect(say('after HT-2')).toMatchObject({ ready: false, lines: ['Still waiting for HT-2 (planned in halftime)'] });
  });
  it('in no list of any repo', () => {
    expect(say('after HT-9 ships')).toMatchObject({ ready: false, lines: ['HT-9 was not found in any project'] });
  });
  it('no ID in the line: nothing (the card does not change)', () => {
    expect(say('the owner picks a colour.')).toBeNull();
    expect(say('FK-61 needs an answer')).toBeNull(); // only its own ID
  });
  it('an idea is not shipped; an idea number many repos use means the one in the stuck item’s own repo', () => {
    expect(say('only after I-1', 'HT-4', 'halftime')).toMatchObject({ ready: false, lines: ['Still waiting for I-1 (an idea in halftime, not planned)'] });
    expect(say('only after I-1')!.lines).toEqual(['Still waiting for I-1 (an idea in footy, not planned)']);
  });
  it('waitLines with nothing named says nothing', () => expect(waitLines([])).toEqual([]));
});

describe('order and counts', () => {
  it('shipped ones sort first; the others keep their place', () => {
    const w = (ready: boolean) => ({ refs: [], ready, lines: [] });
    const list = [{ k: 'a', waits: null }, { k: 'b', waits: w(false) }, { k: 'c', waits: w(true) }, { k: 'd', waits: null }, { k: 'e', waits: w(true) }];
    expect(unblockFirst(list).map((i) => i.k)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });
  it('the board puts "can be unblocked" first in Stuck and counts them', () => {
    const items = boardItems(data, 'name-asc', null);
    const stuck = items.filter((i) => i.lane === 'stuck');
    expect(stuck.map((i) => i.id)).toEqual(['FK-61', 'FK-62', 'AL-1', 'AL-2', 'AL-3', 'HT-4']);
    expect(stuck.map((i) => i.waits?.ready ?? null)).toEqual([true, true, null, false, false, false]);
    expect(unblockCount(items)).toBe(2);
    expect(items.filter((i) => i.lane !== 'stuck').every((i) => i.waits === null)).toBe(true);
    expect(data.projects.map((p) => [p.repo, projectUnblockCount(p, index)])).toEqual([['alpha', 0], ['footy', 2], ['halftime', 0]]);
  });
});
