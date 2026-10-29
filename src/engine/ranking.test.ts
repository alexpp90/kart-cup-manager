import { describe, expect, it } from 'vitest';
import { computeStandings, minHeatsForFinals, suddenDeathKey, tieAcrossCut, type ScoredHeat } from './ranking';
import type { Player } from './types';

const player = (id: string, status: Player['status'] = 'active'): Player => ({
  id, name: id.toUpperCase(), tag: '', avatar: 'fox', color: '#000', favorite: '', status, createdAt: 0, joinedRound: 0,
});
const heat = (id: string, ...entries: [string, number][]): ScoredHeat => ({
  heatId: id,
  scores: entries.map(([playerId, points], i) => ({ playerId, points, place: i + 1 })),
});

describe('qualifying ranking', () => {
  it('ranks by average points per heat so late joiners are not punished', () => {
    const players = ['a', 'b', 'late'].map((id) => player(id));
    const heats = [heat('h1', ['a', 40], ['b', 30]), heat('h2', ['b', 40], ['a', 20], ['late', 10]), heat('h3', ['late', 48], ['a', 1])];
    // a: 61/3 = 20.3, b: 70/2 = 35, late: 58/2 = 29
    const rows = computeStandings(players, heats, 3);
    expect(rows.map((r) => r.playerId)).toEqual(['b', 'late', 'a']);
    expect(rows[1].avg).toBe(29);
  });

  it('needs ceil(rounds/2) heats to be eligible; withdrawn players are never eligible', () => {
    expect(minHeatsForFinals(3)).toBe(2);
    expect(minHeatsForFinals(4)).toBe(2);
    expect(minHeatsForFinals(5)).toBe(3);
    const players = [player('a'), player('b'), player('w', 'withdrawn')];
    const heats = [heat('h1', ['a', 10], ['b', 5], ['w', 50]), heat('h2', ['a', 10], ['w', 50])];
    const rows = computeStandings(players, heats, 3);
    const by = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(by.a.eligible).toBe(true);
    expect(by.b.eligible).toBe(false);
    expect(by.w.eligible).toBe(false);
    expect(by.w.withdrawn).toBe(true);
    expect(by.w.total).toBe(100); // results stay on record
  });

  it('tiebreak 1: total heat wins', () => {
    const players = ['a', 'b', 'x'].map((id) => player(id));
    // a and b both average 20; a has a heat win.
    const heats = [heat('h1', ['a', 20], ['x', 18]), heat('h2', ['x', 30], ['b', 20]), heat('h3', ['x', 30], ['b', 20])];
    const rows = computeStandings(players, heats, 3);
    expect(rows.map((r) => r.playerId)).toEqual(['x', 'a', 'b']);
    expect(rows[1].tieBelow).toMatchObject({ kind: 'wins', other: 'b', mine: 1, theirs: 0 });
    expect(rows[2].tieAbove).toMatchObject({ kind: 'wins', other: 'a', mine: 0, theirs: 1 });
  });

  it('tiebreak 2: best single-heat result', () => {
    const players = ['a', 'b', 'x'].map((id) => player(id));
    // both average 20, no wins; a has a 30 (best), b's best is 25
    const heats = [heat('h1', ['x', 40], ['a', 30]), heat('h2', ['x', 40], ['a', 10]), heat('h3', ['x', 40], ['b', 25]), heat('h4', ['x', 40], ['b', 15])];
    const rows = computeStandings(players, heats, 3);
    expect(rows.map((r) => r.playerId)).toEqual(['x', 'a', 'b']);
    expect(rows[1].tieBelow?.kind).toBe('best');
  });

  it('tiebreak 3: head-to-head when they met', () => {
    const players = ['a', 'b', 'x'].map((id) => player(id));
    // identical avg/wins/best; in h1 b finished ahead of a, in h2 a ahead of b with same points
    const heats = [heat('h1', ['x', 30], ['b', 20], ['a', 20]), heat('h2', ['x', 30], ['b', 20], ['a', 20])];
    const rows = computeStandings(players, heats, 2);
    expect(rows.map((r) => r.playerId)).toEqual(['x', 'b', 'a']);
    expect(rows[1].tieBelow).toMatchObject({ kind: 'h2h', mine: 2, theirs: 0 });
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(3);
  });

  it('tiebreak 4: unresolved ties share a rank until a sudden death decides', () => {
    const players = ['a', 'b', 'x', 'y'].map((id) => player(id));
    // a and b never met, identical stats
    const heats = [heat('h1', ['x', 30], ['a', 20]), heat('h2', ['y', 30], ['b', 20])];
    const rows = computeStandings(players, heats, 1);
    const ab = rows.filter((r) => r.playerId === 'a' || r.playerId === 'b');
    expect(ab[0].rank).toBe(ab[1].rank);
    expect(ab[0].tieBelow?.kind).toBe('unresolved');
    const eligible = rows.filter((r) => r.eligible);
    expect(tieAcrossCut(eligible, 3)).toEqual(['a', 'b']);
    expect(tieAcrossCut(eligible, 2)).toBeNull();

    const decided = computeStandings(players, heats, 1, [{ key: suddenDeathKey(['b', 'a']), order: ['b', 'a'] }]);
    const order = decided.map((r) => r.playerId);
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    const b = decided.find((r) => r.playerId === 'b')!;
    expect(b.tieBelow?.kind).toBe('sudden');
    expect(decided.find((r) => r.playerId === 'a')!.rank).toBe(b.rank + 1);
  });

  it('players without heats go to the bottom', () => {
    const players = ['a', 'new'].map((id) => player(id));
    const rows = computeStandings(players, [heat('h1', ['a', 1])], 3);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'new']);
    expect(rows[1].heats).toBe(0);
  });
});
