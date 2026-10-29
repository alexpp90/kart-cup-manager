import { describe, expect, it } from 'vitest';
import { sizesAreValid, splitHeatSizes } from './heats';

describe('splitHeatSizes', () => {
  it('matches the spec examples', () => {
    expect(splitHeatSizes(30, 8)).toEqual({ ok: true, sizes: [8, 8, 7, 7], byes: 0 });
    const s4 = splitHeatSizes(30, 4);
    expect(s4.ok && s4.sizes).toEqual([4, 4, 4, 4, 4, 4, 3, 3]);
  });

  for (const max of [4, 8] as const) {
    for (let n = 3; n <= 64; n++) {
      it(`n=${n} max=${max}: ceil(n/max) heats, sizes 3..max, spread ≤ 1`, () => {
        const r = splitHeatSizes(n, max);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const racing = n - r.byes;
        expect(r.sizes.length).toBe(Math.ceil(racing / max));
        expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(racing);
        expect(Math.max(...r.sizes) - Math.min(...r.sizes)).toBeLessThanOrEqual(1);
        for (const s of r.sizes) {
          expect(s).toBeGreaterThanOrEqual(3);
          expect(s).toBeLessThanOrEqual(max);
        }
        // Rebalancing via byes is only ever needed for 5 players at max 4.
        expect(r.byes).toBe(n === 5 && max === 4 ? 1 : 0);
        if (r.byes === 0) expect(r.sizes.length).toBe(Math.ceil(n / max));
      });
    }
  }

  it('never creates a heat below 3: 5 players at max 4 → one heat of 4 and a bye', () => {
    expect(splitHeatSizes(5, 4)).toEqual({ ok: true, sizes: [4], byes: 1 });
  });

  it('blocks fewer than 3 players', () => {
    expect(splitHeatSizes(2, 8)).toEqual({ ok: false, reason: 'too-few-players' });
    expect(splitHeatSizes(0, 4)).toEqual({ ok: false, reason: 'too-few-players' });
  });
});

describe('sizesAreValid', () => {
  it('checks bounds and spread', () => {
    expect(sizesAreValid([8, 7], 8)).toBe(true);
    expect(sizesAreValid([9, 6], 8)).toBe(false);
    expect(sizesAreValid([8, 6], 8)).toBe(false);
    expect(sizesAreValid([8, 6], 8, 2)).toBe(true);
    expect(sizesAreValid([2, 3], 4, 2)).toBe(false);
  });
});
