import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampAdvance, defaultAdvance, drawFirstRound, koOutcome, koSplit, planKnockout, seedRound, tieAtCut, restOrder, type Ranked } from './knockout';
import { suddenDeathKey } from './ranking';
import type { FillMode, HeatScore, Round } from './types';

const heatsOf = (plan: ReturnType<typeof planKnockout>) => plan.reduce((a, r) => a + r.sizes.length + (r.lastChance ? 1 : 0), 0);
const shape = (plan: ReturnType<typeof planKnockout>) => plan.map((r) => r.sizes);

/** Check every invariant of one plan; returns a message or null. */
function invariants(n: number, S: number, plan: ReturnType<typeof planKnockout>, fill: FillMode): string | null {
  if (!plan.length) return 'empty plan';
  const last = plan[plan.length - 1];
  if (!last.final || last.sizes.length !== 1 || plan.filter((r) => r.final).length !== 1) return 'must end in exactly one final heat';
  if (plan[0].field !== n) return 'round 1 must hold everyone';
  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    if (r.sizes.some((x) => x < 2 || x > S)) return `heat size out of 2..${S} in round ${i}: ${r.sizes}`;
    if (Math.max(...r.sizes) - Math.min(...r.sizes) > 1) return `spread > 1 in round ${i}`;
    if (r.sizes.reduce((a, b) => a + b, 0) + r.byes !== r.field) return `round ${i} does not seat its field`;
    if (r.byes && !(S === 2 && r.field % 2 === 1 && r.byes === 1)) return `unexpected bye in round ${i}`;
    if (r.final) continue;
    const next = plan[i + 1];
    if (!next) return 'non-final last round';
    if (next.field >= r.field) return `field does not shrink after round ${i}`;
    if (next.field !== r.advancers + r.fillUps) return `next field != advancers + fill-ups after round ${i}`;
    if (r.fillUps > r.sizes.length) return `more fill-ups than heats in round ${i}`;
    if (fill === 'off' && r.fillUps) return 'fill-ups with fill off';
    if (r.advance < 1 || r.advance > Math.min(...r.sizes) - 1) return `X out of range in round ${i}`;
  }
  // A bye in round 1 is followed by a round with no bye for that player: with S=2 the
  // bye goes to a random player in round 1 and to the top seed later, never twice in a row
  // for a field of 3 (round 2 is then the final).
  return null;
}

describe('[REQ-FMT-012] knockout plan invariants', () => {
  it('[REQ-FMT-012] every n 2..64, S 2..8, uniform X and fill mode', () => {
    let plans = 0;
    for (let S = 2; S <= 8; S++) {
      for (let n = 2; n <= 64; n++) {
        for (let X = 1; X <= Math.max(1, S - 1); X++) {
          for (const fill of ['best', 'last-chance', 'off'] as FillMode[]) {
            const plan = planKnockout(n, S, Array(20).fill(X), fill);
            const msg = invariants(n, S, plan, fill);
            if (msg) throw new Error(`n=${n} S=${S} X=${X} ${fill}: ${msg}`);
            plans++;
          }
        }
      }
    }
    expect(plans).toBeGreaterThan(5000);
  });

  it('[REQ-FMT-012] random X per round (fast-check)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 64 }), fc.integer({ min: 2, max: 8 }), fc.array(fc.integer({ min: 1, max: 7 }), { maxLength: 8 }), fc.constantFrom<FillMode>('best', 'last-chance', 'off'), (n, S, xs, fill) => {
        expect(invariants(n, S, planKnockout(n, S, xs, fill), fill)).toBeNull();
      }),
      { numRuns: 2000 },
    );
  });

  it('[REQ-FMT-012][REQ-PLAN-001] reference cases from the plan are exact', () => {
    const def = (S: number) => Array(10).fill(defaultAdvance(S));
    const cases: { n: number; S: number; X: number[]; shape: number[][]; heats: number }[] = [
      { n: 20, S: 8, X: [2], shape: [[7, 7, 6], [8]], heats: 4 },
      { n: 30, S: 8, X: [4, 4], shape: [[8, 8, 7, 7], [8, 8], [8]], heats: 7 },
      { n: 30, S: 4, X: [2, 2, 2], shape: [[4, 4, 4, 4, 4, 4, 3, 3], [4, 4, 4, 4], [4, 4], [4]], heats: 15 },
      { n: 20, S: 8, X: [4, 4], shape: [[7, 7, 6], [8, 7], [8]], heats: 6 },
      { n: 30, S: 8, X: [2], shape: [[8, 8, 7, 7], [8]], heats: 5 },
      { n: 9, S: 8, X: [4], shape: [[5, 4], [7]], heats: 3 },
      { n: 64, S: 8, X: [2, 2], shape: [[8, 8, 8, 8, 8, 8, 8, 8], [8, 8], [6]], heats: 11 },
      { n: 7, S: 2, X: [1, 1], shape: [[2, 2, 2], [2, 2], [2]], heats: 6 },
      { n: 8, S: 8, X: def(8), shape: [[8]], heats: 1 },
    ];
    for (const c of cases) {
      const plan = planKnockout(c.n, c.S, c.X, 'best');
      expect(shape(plan), `${c.n}/${c.S}`).toEqual(c.shape);
      expect(heatsOf(plan)).toBe(c.heats);
      expect(heatsOf(plan) * 17).toBe(c.heats * 17);
    }
    // 7 at heat size 2 has a bye in round 1.
    expect(planKnockout(7, 2, [1, 1], 'best')[0].byes).toBe(1);
    // 9 at 8 with X = 4: clipped to 3 because the smallest heat has 4.
    expect(planKnockout(9, 8, [4], 'best')[0].advance).toBe(3);
  });
});

describe('[REQ-FMT-004][REQ-FMT-005] splits and X', () => {
  it('[REQ-FMT-004] round 1 has ceil(n/S) heats, largest first, a random draw that differs by seed', () => {
    expect(koSplit(30, 8)).toEqual({ sizes: [8, 8, 7, 7], byes: 0 });
    expect(koSplit(8, 8)).toEqual({ sizes: [8], byes: 0 });
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const a = drawFirstRound(ids, 8, 1);
    const b = drawFirstRound(ids, 8, 2);
    expect(a.groups.map((g) => g.length)).toEqual([7, 7, 6]);
    expect(a.groups.flat().sort()).toEqual(ids.slice().sort());
    expect(a.groups).not.toEqual(b.groups);
    expect(drawFirstRound(ids, 8, 1)).toEqual(a);
  });

  it('[REQ-FMT-005] default X is half the heat size, clipped to the smallest heat − 1', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(defaultAdvance)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(clampAdvance(4, [5, 4])).toBe(3);
    expect(clampAdvance(0, [8, 8])).toBe(1);
    expect(clampAdvance(9, [8, 8])).toBe(7);
  });

  it('[REQ-FMT-009] heat size 2, odd field: one bye, random in round 1, top seed later', () => {
    expect(koSplit(7, 2)).toEqual({ sizes: [2, 2, 2], byes: 1 });
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const r1 = drawFirstRound(ids, 2, 3);
    expect(r1.byes).toHaveLength(1);
    expect(r1.groups.flat().concat(r1.byes).sort()).toEqual(ids);
    const later = seedRound(['s1', 's2', 's3'], 2);
    expect(later.byes).toEqual(['s1']);
    expect(later.groups).toEqual([['s2', 's3']]);
    // Everyone races: with 3 players the bye player is in the final.
    const plan = planKnockout(3, 2, [1], 'best');
    expect(shape(plan)).toEqual([[2], [2]]);
  });

  it('[REQ-FMT-008] later rounds are snake seeded; a field of S or fewer is the final', () => {
    const seeds = Array.from({ length: 16 }, (_, i) => `s${i + 1}`);
    const r = seedRound(seeds, 8);
    expect(r.final).toBe(false);
    expect(r.groups[0]).toEqual(['s1', 's4', 's5', 's8', 's9', 's12', 's13', 's16']);
    expect(seedRound(seeds.slice(0, 8), 8)).toEqual({ groups: [seeds.slice(0, 8)], byes: [], final: true });
  });
});

// ---------------------------------------------------------------- outcomes

const heat = (id: string, ids: string[]) => ({ id, playerIds: ids });
const scoresOf = (ids: string[], points: number[]): HeatScore[] => ids.map((playerId, i) => ({ playerId, points: points[i], place: i + 1 }));

function round(heats: string[][], extra: Partial<Round> = {}): Round {
  return { id: 'r', index: 0, heats: heats.map((h, i) => heat(`h${i}`, h)), createdAt: 0, byes: [], advance: 2, fill: 'best', ...extra };
}

describe('[REQ-FMT-006][REQ-FMT-007] who goes on', () => {
  // 20 at 8, X = 2: [7,7,6] → 6 advance, 2 best others fill the final of 8.
  const H = [
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'],
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
  ];
  const pts = [
    [60, 50, 44, 30, 20, 10, 5],
    [60, 50, 40, 39, 20, 10, 5],
    [60, 50, 45, 30, 19, 10],
  ];
  const input = (r: Round, extra: Partial<Parameters<typeof koOutcome>[0]> = {}) => ({
    round: r,
    heatSize: 8,
    scores: r.heats.map((h, i) => scoresOf(h.playerIds, pts[i])),
    lastChanceScores: null,
    withdrawn: new Set<string>(),
    suddenDeath: [],
    defaultFill: 'best' as FillMode,
    ...extra,
  });

  it('[REQ-FMT-006] top 2 of each heat, then the 2 best others by points', () => {
    const o = koOutcome(input(round(H)));
    expect(o.status).toBe('done');
    if (o.status !== 'done') return;
    expect(o.advancing).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'c3', 'a3']);
    expect(o.luckyLosers).toEqual(['c3', 'a3']);
    expect(o.out[0]).toBe('b3');
  });

  it('[REQ-FMT-006] an unplayed heat means the round is still racing', () => {
    const r = round(H);
    expect(koOutcome({ ...input(r), scores: [input(r).scores[0], null, input(r).scores[2]] }).status).toBe('racing');
  });

  it('[REQ-FMT-006] a tie on the fill-up cut needs sudden death; once decided it counts', () => {
    const tiePts = [
      [60, 50, 44, 30, 20, 10, 5],
      [60, 50, 44, 39, 20, 10, 5],
      [60, 50, 45, 30, 20, 10],
    ];
    const r = round(H);
    const base = { ...input(r), scores: r.heats.map((h, i) => scoresOf(h.playerIds, tiePts[i])) };
    const o = koOutcome(base);
    expect(o).toEqual({ status: 'tie', tie: ['a3', 'b3'] });
    const decided = koOutcome({ ...base, suddenDeath: [{ key: suddenDeathKey(['a3', 'b3']), order: ['b3', 'a3'] }] });
    expect(decided.status === 'done' && decided.luckyLosers).toEqual(['c3', 'b3']);
  });

  it('[REQ-FMT-007] Last Chance: the best of the rest (up to S) race for the fill-up places', () => {
    const r = round(H, { fill: 'last-chance' });
    const o = koOutcome(input(r));
    expect(o.status).toBe('last-chance');
    if (o.status !== 'last-chance') return;
    expect(o.places).toBe(2);
    expect(o.pool).toEqual(['c3', 'a3', 'b3', 'b4', 'a4', 'c4', 'a5', 'b5']);
    const lc = scoresOf(['b5', 'a4', 'c3', 'a3', 'b3', 'b4', 'c4', 'a5'], [60, 50, 40, 30, 20, 10, 5, 1]);
    const done = koOutcome({ ...input({ ...r, lastChance: heat('lc', o.pool) }), lastChanceScores: lc });
    expect(done.status === 'done' && done.luckyLosers).toEqual(['b5', 'a4']);
    expect(done.status === 'done' && done.out.slice(0, 3)).toEqual(['c3', 'a3', 'b3']);
  });

  it('[REQ-FMT-007] fill-ups off: only the top X go on', () => {
    const o = koOutcome(input(round(H, { fill: 'off' })));
    expect(o.status === 'done' && o.advancing).toHaveLength(6);
    expect(o.status === 'done' && o.luckyLosers).toEqual([]);
  });

  it('[REQ-FMT-010] an advancer who withdraws is replaced by the next best of the rest', () => {
    const o = koOutcome({ ...input(round(H, { fill: 'off' })), withdrawn: new Set(['b1']) });
    expect(o.status === 'done' && o.advancing).toEqual(['a1', 'c1', 'a2', 'b2', 'c2', 'c3']);
    expect(o.status === 'done' && o.out).toContain('b1');
  });

  it('[REQ-FMT-014] the final ranks by place', () => {
    const r = round([['x', 'y', 'z']], { final: true, advance: 0 });
    const o = koOutcome({ ...input(r), scores: [scoresOf(['y', 'x', 'z'], [40, 30, 20])] });
    expect(o).toEqual({ status: 'done', advancing: [], luckyLosers: [], out: ['y', 'x', 'z'], final: true });
  });

  it('[REQ-FMT-006] rest order is points, then place; cut ties only count across the cut', () => {
    const e: Ranked[] = [
      { playerId: 'p', points: 30, place: 3, heat: 0 },
      { playerId: 'q', points: 30, place: 4, heat: 1 },
      { playerId: 'r', points: 31, place: 4, heat: 2 },
    ];
    expect(restOrder(e, []).map((x) => x.playerId)).toEqual(['r', 'p', 'q']);
    const same: Ranked[] = [
      { playerId: 'p', points: 30, place: 3, heat: 0 },
      { playerId: 'q', points: 30, place: 3, heat: 1 },
    ];
    expect(tieAtCut(same, 1, [])).toEqual(['p', 'q']);
    expect(tieAtCut(same, 2, [])).toBeNull();
  });
});
