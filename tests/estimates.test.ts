// BL-8: the "**Estimate:**" line on planned items, the measured "(took …)" suffix on built lines, the BUILT.md header's
// "Suite time:" line, and the totals.
import { describe, expect, it } from 'vitest';
import { estimateTotal, formatDuration, parseBacklog, parseBuiltDays, parseDuration, parseEstimate, parseSuiteRecord, parseTook } from '../lib/lists.mjs';
import { BUILT } from './fixtures';

describe('parseDuration', () => {
  it('reads minutes, ranges and decimals', () => {
    expect(parseDuration('~12 min')).toEqual({ min: 12, max: 12 });
    expect(parseDuration('~10–20 min')).toEqual({ min: 10, max: 20 });
    expect(parseDuration('10-20 minutes')).toEqual({ min: 10, max: 20 });
    expect(parseDuration('0.5 min')).toEqual({ min: 0.5, max: 0.5 });
  });
  it('anything else is null', () => {
    for (const bad of ['', 'soon', '12', '~2 h', '20–10 min']) expect(parseDuration(bad)).toBeNull();
  });
});

describe('parseEstimate', () => {
  it('present', () => {
    expect(parseEstimate('Spec.\n**Estimate:** build ~30 min · suite ~2–5 min\n')).toEqual({ raw: 'build ~30 min · suite ~2–5 min', build: { min: 30, max: 30 }, suite: { min: 2, max: 5 }, ok: true });
    expect(parseEstimate('- **Estimate:** build ~3 min, suite ~1 min')!.ok).toBe(true);
  });
  it('missing', () => {
    expect(parseEstimate('Just a spec.\nEstimate later.')).toBeNull();
    expect(parseEstimate('')).toBeNull();
  });
  it('malformed: kept as raw text, not ok', () => {
    expect(parseEstimate('**Estimate:** soon-ish')).toEqual({ raw: 'soon-ish', build: null, suite: null, ok: false });
    expect(parseEstimate('**Estimate:** build ~30 min')).toMatchObject({ build: { min: 30, max: 30 }, suite: null, ok: false });
  });
  it('parseBacklog puts it on each item', () => {
    const [ready] = parseBacklog('## Ready\n\n### AB-1 — One\n**Estimate:** build ~5 min · suite ~1 min\n\n### AB-2 — Two\nNo estimate.\n');
    expect(ready!.items.map((i) => i.estimate?.ok ?? null)).toEqual([true, null]);
  });
});

describe('parseTook', () => {
  it('present: build and suite, or build only', () => {
    expect(parseTook('BL-1 — Thing (v1.0.0) (took 42 min, suite 3 min)')).toEqual({ raw: '42 min, suite 3 min', build: { min: 42, max: 42 }, suite: { min: 3, max: 3 }, ok: true });
    expect(parseTook('Thing (v1.0.0) (took 7 min)')).toMatchObject({ build: { min: 7, max: 7 }, suite: null, ok: true });
  });
  it('missing', () => {
    expect(parseTook('BL-1 — Thing (v1.0.0)')).toBeNull();
  });
  it('malformed', () => {
    expect(parseTook('Thing (took ages)')).toEqual({ raw: 'ages', build: null, suite: null, ok: false });
  });
  it('parseBuiltDays reads it and keeps it out of the title, the copied line unchanged', () => {
    const [day] = parseBuiltDays('## 2026-11-18\n- BL-8 — Estimates (v1.6.0) (took 30 min, suite 1 min)\n  Detail.\n');
    expect(day!.items[0]).toMatchObject({ id: 'BL-8', title: 'Estimates (v1.6.0)', version: '1.6.0', took: { ok: true } });
    expect(day!.items[0]!.markdown).toBe('- BL-8 — Estimates (v1.6.0) (took 30 min, suite 1 min)\n  Detail.');
  });
});

describe('parseSuiteRecord', () => {
  it('reads last and longest from the header', () => {
    expect(parseSuiteRecord(BUILT)).toEqual({ raw: 'last ~3 min (2026-11-15) · longest ~9 min (2026-11-01)', last: { minutes: 3, date: '2026-11-15' }, longest: { minutes: 9, date: '2026-11-01' } });
  });
  it('missing, or only below the first day, is null', () => {
    expect(parseSuiteRecord('# Built\n\n## 2026-11-01\n- x\nSuite time: last 3 min\n')).toBeNull();
    expect(parseSuiteRecord('')).toBeNull();
  });
  it('malformed parts are null', () => {
    expect(parseSuiteRecord('Suite time: last ~0.5 min · longest a while\r\n')).toEqual({ raw: 'last ~0.5 min · longest a while', last: { minutes: 0.5, date: null }, longest: null });
  });
});

describe('estimateTotal', () => {
  const e = (b: [number, number], s: [number, number]) => ({ estimate: { raw: '', build: { min: b[0], max: b[1] }, suite: { min: s[0], max: s[1] }, ok: true } });
  it('adds up readable estimates only', () => {
    const t = estimateTotal([e([10, 20], [2, 2]), e([5, 5], [1, 3]), { estimate: null }, { estimate: { raw: 'x', build: null, suite: null, ok: false } }]);
    expect(t).toEqual({ build: { min: 15, max: 25 }, suite: { min: 3, max: 5 }, estimated: 2, total: 4 });
    expect(formatDuration(t.build)).toBe('~15–25 min');
    expect(formatDuration({ min: 0.5, max: 0.5 })).toBe('~0.5 min');
  });
  it('none estimated', () => {
    expect(estimateTotal([{ estimate: null }])).toEqual({ build: null, suite: null, estimated: 0, total: 1 });
  });
});
