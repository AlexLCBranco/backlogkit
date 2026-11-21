// BL-20: a search that is exactly an item code is found and explained (src/code.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAll } from '../lib/github.mjs';
import { codePrefixes, headingAnchor, lookupCode, missingText, parseCode, stateText } from '../src/code';
import type { Data } from '../src/types';
import { BACKLOG, BUILT, IDEAS, mockGithub, projectsJson } from './fixtures';

let data: Data;
beforeAll(async () => {
  const { fetchImpl } = mockGithub({
    repos: [{ name: 'demo' }, { name: 'other', default_branch: 'trunk' }],
    files: {
      demo: { 'FEATURE_BACKLOG.md': BACKLOG.replace('Line one of the spec.', '**In short:** The first thing shows up.\nLine one of the spec.'), 'BUILT.md': BUILT, 'IDEAS.md': IDEAS },
      other: { 'FEATURE_BACKLOG.md': '## Ready\n\n### OT-10 — Other ten\nText.\n', 'IDEAS.md': '# Ideas\n\n- I-1 — Other idea (2026-11-03)\n' },
      backlogkit: { 'UNASSIGNED_IDEAS.md': '# Unassigned\n\n- U-1 — Orphan gadget (2026-11-18)\n' },
    },
    projectsJson: projectsJson([{ repo: 'demo', description: 'Demo', url: null, status: 'active', devices: null }]),
  });
  data = (await loadAll({ token: 'tok', fetchImpl })) as Data;
});

const REPOS = ['demo', 'other'];
const P = new Set(['DM', 'OT', 'I', 'U']);

describe('code detection', () => {
  it('knows every prefix in use', () => {
    expect([...codePrefixes(data)].sort()).toEqual(['DM', 'I', 'OT', 'U']);
  });
  it('a code in any case, with or without the dash', () => {
    for (const t of ['DM-5', 'dm-5', ' Dm-5 ', 'dm5', 'DM5']) expect(parseCode(t, REPOS, P)).toEqual({ code: 'DM-5', repo: null });
    expect(parseCode('u1', REPOS, P)).toEqual({ code: 'U-1', repo: null });
    expect(parseCode('ck-999', REPOS, P)).toEqual({ code: 'CK-999', repo: null }); // unknown, but written as a code
    expect(parseCode('fk-12B', REPOS, P)).toEqual({ code: 'FK-12b', repo: null });
  });
  it('an idea code with its repo, either way round', () => {
    expect(parseCode('demo I-2', REPOS, P)).toEqual({ code: 'I-2', repo: 'demo' });
    expect(parseCode('i2 DEMO', REPOS, P)).toEqual({ code: 'I-2', repo: 'demo' });
  });
  it('ordinary words are not codes', () => {
    for (const t of ['', 'thing', 'ps5', 'dark mode', 'DM-5 extra words', 'nowhere I-2', 'DM-', 'toolong-1', 'DM-5 DM-1']) expect(parseCode(t, REPOS, P)).toBeNull();
  });
});

describe('lookup across planned, built and ideas', () => {
  const one = (text: string, selected: string[] = []) => lookupCode(data, parseCode(text, REPOS, P)!, selected);
  it('a planned item: its In short line and a link to its heading', () => {
    expect(one('dm1')).toEqual([
      { key: 'demo:plan:0', code: 'DM-1', title: 'First thing', repo: 'demo', state: 'Planned', version: null, date: null, short: 'The first thing shows up.', href: 'https://github.com/AlexLCBranco/demo/blob/main/FEATURE_BACKLOG.md#dm-1--first-thing' },
    ]);
  });
  it('a blocked item is Blocked; no In short line is null (the box shows a dash)', () => {
    expect(one('DM-2')[0]).toMatchObject({ state: 'Blocked', short: null });
    expect(one('DM-3')[0]).toMatchObject({ state: 'Planned', short: null }); // held, not blocked
    expect(one('ot10')[0]!.href).toBe('https://github.com/AlexLCBranco/other/blob/trunk/FEATURE_BACKLOG.md#ot-10--other-ten');
  });
  it('a built item: version, date and its description line', () => {
    expect(one('dm-5')[0]).toMatchObject({ code: 'DM-5', title: 'Newest thing', repo: 'demo', state: 'Built', version: '1.3.0', date: '2026-11-17', short: 'What the owner sees now.', href: 'https://github.com/AlexLCBranco/demo/blob/main/BUILT.md' });
    expect(one('DM-0')[0]).toMatchObject({ state: 'Built', short: null }); // no description line
    expect(stateText(one('dm-5')[0]!)).toBe('Built · v1.3.0 · 2026-11-17');
    expect(stateText({ state: 'Built', version: null, date: '2026-11-16' })).toBe('Built · — · 2026-11-16');
    expect(stateText({ state: 'Blocked', version: null, date: null })).toBe('Blocked');
  });
  it('an idea code alone finds it in every repo; with its repo, only there', () => {
    expect(one('I-1').map((h) => [h.repo, h.title, h.state])).toEqual([['demo', 'Dark mode toggle', 'Idea'], ['other', 'Other idea', 'Idea']]);
    expect(one('other i-1').map((h) => h.repo)).toEqual(['other']);
    expect(one('I-1', ['other']).map((h) => h.repo)).toEqual(['other']); // the chosen project's
    expect(one('I-2', ['other']).map((h) => h.repo)).toEqual(['demo']); // only one anywhere: shown whatever is chosen
    expect(one('demo I-1')[0]!.href).toBe('https://github.com/AlexLCBranco/demo/blob/main/IDEAS.md');
  });
  it('an unassigned idea', () => {
    expect(one('u-1')).toEqual([{ key: 'unassigned:0', code: 'U-1', title: 'Orphan gadget', repo: null, state: 'Idea', version: null, date: null, short: null, href: 'https://github.com/AlexLCBranco/backlogkit/blob/main/UNASSIGNED_IDEAS.md' }]);
  });
  it('an unknown code finds nothing and says so', () => {
    expect(one('CK-999')).toEqual([]);
    expect(missingText({ code: 'CK-999', repo: null })).toBe('No feature has the code CK-999');
    expect(one('other I-9')).toEqual([]);
    expect(missingText({ code: 'I-9', repo: 'other' })).toBe('No feature has the code I-9 in other');
  });
  it('heading anchors as GitHub makes them', () => {
    expect(headingAnchor('BL-20 — Searching a feature code explains it at the top')).toBe('bl-20--searching-a-feature-code-explains-it-at-the-top');
    expect(headingAnchor('CK-1 — Week view (v2): faster!')).toBe('ck-1--week-view-v2-faster');
  });
});
