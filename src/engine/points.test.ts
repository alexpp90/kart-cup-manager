import { describe, expect, it } from 'vitest';
import { autoCompleteOrder, DEFAULT_POINTS_4, DEFAULT_POINTS_8, orderFromTotals, orderPerRace, perRaceTotals, pointsForPlace, scoreHeat, totalsTieGroups, validateOrder, validateResult } from './points';

describe('points tables', () => {
  it('has the default tables', () => {
    expect(DEFAULT_POINTS_8).toEqual([15, 12, 10, 8, 6, 4, 2, 1]);
    expect(DEFAULT_POINTS_4).toEqual([10, 6, 3, 1]);
    expect(pointsForPlace(DEFAULT_POINTS_8, 1)).toBe(15);
    expect(pointsForPlace(DEFAULT_POINTS_4, 4)).toBe(1);
    expect(pointsForPlace(DEFAULT_POINTS_4, 5)).toBe(0);
  });
});

describe('per-race entry (mode A)', () => {
  const players = ['a', 'b', 'c', 'd'];
  it('auto-fills the last finisher', () => {
    expect(autoCompleteOrder(['b', 'a', 'd'], players)).toEqual(['b', 'a', 'd', 'c']);
    expect(autoCompleteOrder(['b', 'a'], players)).toEqual(['b', 'a']);
  });

  it('sums points over races', () => {
    const races = [
      ['a', 'b', 'c', 'd'],
      ['b', 'a', 'd', 'c'],
    ];
    expect(perRaceTotals(races, players, DEFAULT_POINTS_4)).toEqual({ a: 16, b: 16, c: 4, d: 4 });
  });

  it('breaks equal totals by countback then last race', () => {
    const races = [
      ['a', 'b', 'c', 'd'],
      ['b', 'a', 'd', 'c'],
    ];
    // a and b: one win each, one 2nd each → last race decides (b ahead). c/d same → d ahead in last race.
    expect(orderPerRace(races, players, DEFAULT_POINTS_4)).toEqual(['b', 'a', 'd', 'c']);
    const races2 = [
      ['a', 'c', 'b', 'd'], // a 10, c 6, b 3, d 1
      ['b', 'd', 'c', 'a'], // b 10, d 6, c 3, a 1 → a 11, b 13, c 9, d 7
    ];
    expect(orderPerRace(races2, players, DEFAULT_POINTS_4)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('a 3-player heat uses the top of the 4-player table', () => {
    const s = scoreHeat({ id: 'h', playerIds: ['a', 'b', 'c'], result: { mode: 'per-race', races: [['c', 'a', 'b']] } }, DEFAULT_POINTS_4)!;
    expect(s).toEqual([
      { playerId: 'c', points: 10, place: 1 },
      { playerId: 'a', points: 6, place: 2 },
      { playerId: 'b', points: 3, place: 3 },
    ]);
  });

  it('validates duplicates, missing and unknown players', () => {
    expect(validateOrder(['a', 'b', 'c', 'd'], players)).toEqual([]);
    const errs = validateOrder(['a', 'a', 'x'], players);
    expect(errs.map((e) => e.code).sort()).toEqual(['duplicate', 'missing', 'unknown']);
    const r = validateResult({ mode: 'per-race', races: [['a', 'b', 'c', 'd']] }, players, 4);
    expect(r[0]).toEqual({ code: 'race-count', expected: 4, actual: 1 });
  });

  it('scores a full 8-player cup', () => {
    const p8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const races = [p8, p8, p8, p8.slice().reverse()];
    const s = scoreHeat({ id: 'h', playerIds: p8, result: { mode: 'per-race', races } }, DEFAULT_POINTS_8)!;
    expect(s[0]).toEqual({ playerId: 'a', points: 46, place: 1 });
    // g and h both have 18: h wins countback with a race win.
    expect(s.find((x) => x.playerId === 'h')).toEqual({ playerId: 'h', points: 18, place: 7 });
    expect(s[7]).toEqual({ playerId: 'g', points: 18, place: 8 });
  });
});

describe('console totals entry (mode B)', () => {
  const players = ['a', 'b', 'c'];
  it('orders by totals and keeps manual tie order', () => {
    const points = { a: 30, b: 42, c: 30 };
    expect(orderFromTotals(points, players)).toEqual(['b', 'a', 'c']);
    expect(orderFromTotals(points, players, ['c', 'b', 'a'])).toEqual(['b', 'c', 'a']);
    expect(totalsTieGroups(points, players)).toEqual([['a', 'c']]);
  });

  it('validates numbers and order consistency', () => {
    expect(validateResult({ mode: 'totals', points: { a: 30, b: 42, c: 12 }, order: ['b', 'a', 'c'] }, players, 4)).toEqual([]);
    expect(validateResult({ mode: 'totals', points: { a: 30, b: Number.NaN, c: 12 }, order: ['b', 'a', 'c'] }, players, 4)[0].code).toBe('not-a-number');
    expect(validateResult({ mode: 'totals', points: { a: 30, b: 42, c: 12 }, order: ['a', 'b', 'c'] }, players, 4)[0].code).toBe('duplicate');
    expect(validateResult({ mode: 'totals', points: { a: 30, b: 42, c: 12 }, order: ['b', 'a'] }, players, 4)[0].code).toBe('missing');
  });

  it('scores with the typed console points', () => {
    const s = scoreHeat({ id: 'h', playerIds: players, result: { mode: 'totals', points: { a: 30, b: 42, c: 30 }, order: ['b', 'c', 'a'] } }, DEFAULT_POINTS_8)!;
    expect(s).toEqual([
      { playerId: 'b', points: 42, place: 1 },
      { playerId: 'c', points: 30, place: 2 },
      { playerId: 'a', points: 30, place: 3 },
    ]);
  });
});
