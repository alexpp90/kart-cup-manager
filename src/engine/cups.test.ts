import { describe, expect, it } from 'vitest';
import { CUPS } from '../data/cups';
import { cupPool, pickRandomCup, pickRandomTracks, remainingInCycle, trackPool } from './cups';
import { createRng } from './rng';

describe('cup picker', () => {
  it('has 12 base cups and 12 Booster Course Pass cups with 4 tracks each', () => {
    expect(CUPS.filter((c) => !c.booster)).toHaveLength(12);
    expect(CUPS.filter((c) => c.booster)).toHaveLength(12);
    expect(CUPS.every((c) => c.tracks.length === 4)).toBe(true);
    expect(new Set(CUPS.map((c) => c.id)).size).toBe(24);
    expect(cupPool(CUPS, false)).toHaveLength(12);
  });

  it('never repeats a cup until all have been used', () => {
    const pool = cupPool(CUPS, true);
    const rng = createRng(1);
    const used: string[] = [];
    for (let i = 0; i < 24; i++) {
      const p = pickRandomCup(pool, used, rng);
      if (p.kind !== 'cup') throw new Error();
      expect(used).not.toContain(p.cupId);
      used.push(p.cupId);
    }
    // Second cycle starts fresh, and again no repeats inside it.
    const second: string[] = [];
    for (let i = 0; i < 24; i++) {
      const p = pickRandomCup(pool, [...used, ...second], rng);
      if (p.kind !== 'cup') throw new Error();
      expect(second).not.toContain(p.cupId);
      second.push(p.cupId);
    }
  });

  it('random tracks are distinct and avoid already used tracks', () => {
    const tracks = trackPool(cupPool(CUPS, false));
    expect(tracks).toHaveLength(48);
    const used = tracks.slice(0, 44).map((t) => t.id);
    const p = pickRandomTracks(tracks, used, 4, createRng(2));
    if (p.kind !== 'tracks') throw new Error();
    expect(p.trackIds.sort()).toEqual(tracks.slice(44).map((t) => t.id).sort());
  });

  it('remainingInCycle', () => {
    expect(remainingInCycle(['a', 'b', 'c'], ['a', 'b', 'c', 'a'])).toEqual(['b', 'c']);
  });
});
