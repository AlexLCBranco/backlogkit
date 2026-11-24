// BL-21: stuck items say when the thing they wait for has shipped.
import { beforeAll, describe, expect, it } from 'vitest';
import { boardItems, projectUnblockCount, unblockCount } from '../src/board';
import { blockedIds, checkRow, codeIndex, stuckGroups, stuckSummary, unblockFirst, unstickText, waitLines, waitsFor, type CodeIndex } from '../src/waits';
import type { Data } from '../src/types';
import { SCREENSHOT_FILES, waitData } from './wait-fixtures';

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

describe('BL-24: groups, header words, checklist rows, Unstick text', () => {
  const w = (ready: boolean) => ({ refs: [], ready, lines: [] });
  it('ready / waiting / answer, in that order, each keeping its order; summary leaves zeros out', () => {
    const list = [{ k: 'a', waits: null }, { k: 'b', waits: w(false) }, { k: 'c', waits: w(true) }, { k: 'd', waits: w(true) }];
    expect(stuckGroups(list).map((g) => [g.key, g.label, g.items.map((i) => i.k)])).toEqual([
      ['ready', 'Ready to go again', ['c', 'd']],
      ['waiting', 'Still waiting', ['b']],
      ['answer', 'Needs your answer', ['a']],
    ]);
    expect(stuckSummary(list)).toBe('2 ready to go again · 1 still waiting');
    expect(stuckSummary([{ waits: w(true) }])).toBe('1 ready to go again');
    expect(stuckSummary([{ waits: w(false) }])).toBe('1 still waiting');
    expect(stuckSummary([{ waits: null }])).toBe('');
  });
  it('a row per state: shipped, planned, idea (in a repo and unassigned), missing, stuck but ready', async () => {
    const say = (note: string, id = 'FK-61', repo = 'footy') => waitsFor(note, id, repo, index)!.refs.map(checkRow);
    expect(say('once HT-1 ships')).toEqual([{ id: 'HT-1', mark: '✓', tone: 'ok', text: 'HT-1 — halftime — built 2026-11-20', about: 'Half time timer', unstickFirst: null }]);
    expect(say('after HT-2')).toEqual([{ id: 'HT-2', mark: '⏳', tone: 'wait', text: 'HT-2 — halftime — planned, not built yet', about: 'Second half', unstickFirst: null }]);
    expect(say('only after I-1')[0]).toMatchObject({ mark: '⏳', tone: 'wait', text: 'I-1 — an idea in footy, not planned yet', about: 'A footy idea' });
    expect(checkRow({ id: 'U-3', state: 'idea', repo: null, date: null })).toMatchObject({ text: 'U-3 — an idea with no project yet, not planned yet', about: null });
    expect(say('after HT-9')).toEqual([{ id: 'HT-9', mark: '✕', tone: 'bad', text: 'HT-9 — not found in any project', about: null, unstickFirst: null }]);
    const shot = codeIndex(await waitData(SCREENSHOT_FILES));
    expect(waitsFor('waits for GT-14', 'GT-21', 'gauntlet', shot)!.refs.map(checkRow)).toEqual([
      { id: 'GT-14', mark: '⏳', tone: 'wait', text: 'GT-14 — gauntlet — is stuck but ready: unstick it first', about: 'The score shows on top of the run.', unstickFirst: 'gauntlet' },
    ]);
    // Stuck but not ready (it waits for something unbuilt) is just "planned".
    expect(waitsFor('after AL-2', 'X-1', 'alpha', index)!.refs.map(checkRow)[0]!.text).toBe('AL-2 — alpha — planned, not built yet');
  });
  it('the Unstick text names every shipped item with its project and day', () => {
    expect(unstickText(waitsFor('once HT-1 ships', 'FK-61', 'footy', index)!)).toBe('Everything it waited for is built: HT-1 (halftime, 2026-11-20).');
    expect(unstickText(waitsFor('waits for HT-1 and HT-3', 'FK-62', 'footy', index)!)).toBe('Everything it waited for is built: HT-1 (halftime, 2026-11-20), HT-3 (halftime, 2026-11-18).');
  });
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
