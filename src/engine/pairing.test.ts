import { describe, expect, it } from 'vitest';
import { buildPairHistory, generatePairing, pairKey, repeatedPairs, repeatScore } from './pairing';
import { splitHeatSizes } from './heats';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('repeat score', () => {
  it('[REQ-ENG-005] sums squared previous meetings for each pair', () => {
    const history = buildPairHistory([
      ['a', 'b', 'c'],
      ['a', 'b', 'd'],
    ]);
    expect(history.get(pairKey('a', 'b'))).toBe(2);
    expect(history.get(pairKey('b', 'a'))).toBe(2);
    // a-b met twice (4), a-c once (1), b-c once (1)
    expect(repeatScore([['a', 'b', 'c']], history)).toBe(6);
    expect(repeatedPairs([['a', 'b', 'c']], history)).toBe(3);
    expect(repeatScore([['c', 'd', 'e']], history)).toBe(0);
  });

  it('[REQ-ENG-005] squares so a third meeting costs more than two second meetings', () => {
    const h = buildPairHistory([['a', 'b'], ['a', 'b'], ['c', 'd'], ['e', 'f']]);
    expect(repeatScore([['a', 'b']], h)).toBe(4);
    expect(repeatScore([['c', 'd'], ['e', 'f']], h)).toBe(2);
  });
});

describe('generatePairing', () => {
  it('[REQ-ENG-006][REQ-ENG-041] places every player exactly once with the requested sizes', () => {
    const players = ids(30);
    const r = generatePairing({ players, sizes: [8, 8, 7, 7], history: new Map(), seed: 1 });
    expect(r.groups.map((g) => g.length).sort()).toEqual([7, 7, 8, 8]);
    expect(r.groups.flat().sort()).toEqual(players.slice().sort());
    expect(r.repeatScore).toBe(0);
  });

  it('[REQ-ENG-006] is deterministic for a seed', () => {
    const a = generatePairing({ players: ids(20), sizes: [7, 7, 6], history: new Map(), seed: 42 });
    const b = generatePairing({ players: ids(20), sizes: [7, 7, 6], history: new Map(), seed: 42 });
    expect(a.groups).toEqual(b.groups);
  });

  it('[REQ-ENG-006] avoids repeats far better than a naive split', () => {
    const players = ids(30);
    const split = splitHeatSizes(30, 8);
    if (!split.ok) throw new Error();
    const r1 = generatePairing({ players, sizes: split.sizes, history: new Map(), seed: 3 });
    const history = buildPairHistory(r1.groups);
    const r2 = generatePairing({ players, sizes: split.sizes, history, seed: 4 });
    // Repeating round 1 exactly would cost every pair again.
    expect(repeatScore(r1.groups, history)).toBe(28 + 28 + 21 + 21);
    // 4 heats of ~8 out of 4 previous heats: about 2 per old heat per new heat → ≈ 4 repeated pairs per heat.
    expect(r2.repeatScore).toBeLessThanOrEqual(18);
    const r3 = generatePairing({ players, sizes: split.sizes, history: buildPairHistory([...r1.groups, ...r2.groups]), seed: 5 });
    expect(r3.repeatScore).toBeLessThanOrEqual(30);
  });

  it('[REQ-ENG-006] finds a perfect zero-repeat round when one exists (max 4, 16 players)', () => {
    const players = ids(16);
    const r1 = generatePairing({ players, sizes: [4, 4, 4, 4], history: new Map(), seed: 9 });
    const r2 = generatePairing({ players, sizes: [4, 4, 4, 4], history: buildPairHistory(r1.groups), seed: 10 });
    expect(r2.repeatScore).toBe(0);
  });

  it('[REQ-ENG-008] keeps players from the previous last heat out of the first heat when possible', () => {
    const players = ids(16);
    const avoidFirst = players.slice(0, 8);
    const r = generatePairing({ players, sizes: [8, 8], history: new Map(), avoidFirst, seed: 7 });
    expect(r.backToBack).toBe(0);
    expect(r.groups[0].some((p) => avoidFirst.includes(p))).toBe(false);
  });

  it('[REQ-ENG-007] spreads the strongest players across heats (light seeding)', () => {
    const players = ids(24);
    const r = generatePairing({ players, sizes: [8, 8, 8], history: new Map(), seedOrder: players, seed: 11 });
    const top3 = ['p1', 'p2', 'p3'];
    for (const g of r.groups) expect(g.filter((p) => top3.includes(p)).length).toBe(1);
    expect(r.seedConflicts).toBe(0);
  });
});
