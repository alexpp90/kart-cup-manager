import { describe, expect, it } from 'vitest';
import { finalStandings, presetStages, snakeSeed, splitStageOutcome, validateStages } from './finals';
import type { FinalsStage, HeatScore } from './types';

describe('finals stages', () => {
  it('[REQ-ENG-033] max 8 preset: Top 16 → 2 semis of 8 → top 4 → Grand Final of 8', () => {
    expect(presetStages(8, 30)).toEqual([
      { name: 'stage.semi', fieldSize: 16, heatSize: 8, advancePerHeat: 4, wildcards: 0 },
      { name: 'stage.grand', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 0 },
    ]);
  });

  it('[REQ-ENG-033] max 4 preset: Top 16 → 4 QF → top 2 → 2 SF → top 2 → Final of 4', () => {
    expect(presetStages(4, 20)!.map((s) => [s.fieldSize, s.heatSize, s.advancePerHeat])).toEqual([
      [16, 4, 2],
      [8, 4, 2],
      [4, 4, 0],
    ]);
  });

  it('[REQ-ENG-033] small fields get a sensible automatic preset', () => {
    expect(presetStages(8, 10)!.map((s) => s.fieldSize)).toEqual([8]);
    expect(presetStages(8, 13)!.map((s) => s.fieldSize)).toEqual([12, 8]);
    expect(presetStages(8, 5)!.map((s) => s.fieldSize)).toEqual([5]);
    expect(presetStages(4, 11)!.map((s) => s.fieldSize)).toEqual([8, 4]);
    expect(presetStages(4, 6)!.map((s) => s.fieldSize)).toEqual([4]);
    expect(presetStages(4, 3)!.map((s) => s.fieldSize)).toEqual([3]);
    expect(presetStages(8, 2)).toBeNull();
  });

  for (const max of [4, 8] as const) {
    it(`[REQ-ENG-033][REQ-ENG-031] every automatic preset validates (max ${max}, 3..64 eligible, with and without Last Chance)`, () => {
      for (let n = 3; n <= 64; n++) {
        for (const lc of [false, true]) {
          const stages = presetStages(max, n, lc, 2)!;
          expect(validateStages(stages, { heatSize: max, eligible: n })).toEqual([]);
        }
      }
    });
  }

  it('[REQ-ENG-034] adds Last Chance wildcards to the first stage when the pool is big enough', () => {
    const s = presetStages(8, 24, true, 2)!;
    expect(s[0].wildcards).toBe(2);
    expect(presetStages(8, 17, true, 2)![0].wildcards).toBe(2); // 14 direct, pool of 3 → a real heat
    expect(presetStages(8, 16, true, 2)![0].wildcards).toBe(0); // pool of 2 is too small → no Last Chance
  });

  it('[REQ-ENG-031] reports configurations that do not add up', () => {
    const codes = (stages: Parameters<typeof validateStages>[0], eligible = 30, max: 4 | 8 = 8) =>
      validateStages(stages, { heatSize: max, eligible }).map((e) => e.code);
    expect(codes([])).toEqual(['no-stages']);
    expect(codes([{ name: 'x', fieldSize: 15, heatSize: 8, advancePerHeat: 4, wildcards: 0 }, { name: 'f', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 0 }])).toContain('not-divisible');
    expect(codes([{ name: 'x', fieldSize: 16, heatSize: 8, advancePerHeat: 3, wildcards: 0 }, { name: 'f', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 0 }])).toContain('field-mismatch');
    expect(codes([{ name: 'x', fieldSize: 16, heatSize: 8, advancePerHeat: 3, wildcards: 2 }, { name: 'f', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 2 }])).toEqual([]);
    expect(codes([{ name: 'f', fieldSize: 16, heatSize: 8, advancePerHeat: 0, wildcards: 0 }])).toContain('final-single-heat');
    expect(codes([{ name: 'x', fieldSize: 16, heatSize: 8, advancePerHeat: 8, wildcards: 0 }, { name: 'f', fieldSize: 16, heatSize: 16, advancePerHeat: 0, wildcards: 0 }])).toEqual(['advance', 'heat-size']);
    expect(codes([{ name: 'f', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 0 }], 6)).toContain('not-enough-players');
    expect(codes([{ name: 'f', fieldSize: 8, heatSize: 8, advancePerHeat: 0, wildcards: 2 }], 7)).toContain('last-chance-pool');
    expect(codes([{ name: 'f', fieldSize: 4, heatSize: 4, advancePerHeat: 0, wildcards: 3 }], 10, 4)).toContain('wildcards');
  });
});

describe('snake seeding', () => {
  it('[REQ-ENG-032] deals 1,4,5,8… / 2,3,6,7…', () => {
    const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(snakeSeed(seeds, 2)).toEqual([
      [1, 4, 5, 8, 9, 12, 13, 16],
      [2, 3, 6, 7, 10, 11, 14, 15],
    ]);
    expect(snakeSeed(seeds, 4)).toEqual([
      [1, 8, 9, 16],
      [2, 7, 10, 15],
      [3, 6, 11, 14],
      [4, 5, 12, 13],
    ]);
  });
});

describe('advancement and final standings', () => {
  const sc = (ids: string[], pts: number[]): HeatScore[] => ids.map((playerId, i) => ({ playerId, points: pts[i], place: i + 1 }));
  const semi: FinalsStage = {
    config: { name: 'stage.semi', fieldSize: 8, heatSize: 4, advancePerHeat: 2, wildcards: 0 },
    seeds: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
    heats: [],
  };
  const semiScores = [sc(['s1', 's8', 's4', 's5'], [40, 30, 20, 10]), sc(['s7', 's2', 's3', 's6'], [40, 35, 20, 10])];

  it('[REQ-ENG-035] advances heat place first, then points, then seed', () => {
    const { advancing, eliminated } = splitStageOutcome(semi, semiScores);
    expect(advancing).toEqual(['s1', 's7', 's2', 's8']);
    expect(eliminated).toEqual(['s3', 's4', 's5', 's6']);
  });

  it('[REQ-ENG-038] Grand Final placement decides the podium, earlier exits follow', () => {
    const final: FinalsStage = { config: { name: 'stage.final', fieldSize: 4, heatSize: 4, advancePerHeat: 0, wildcards: 0 }, seeds: [], heats: [] };
    const rows = finalStandings([semi, final], [semiScores, [sc(['s8', 's1', 's7', 's2'], [40, 30, 20, 10])]], [null, null], ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'q9']);
    expect(rows.map((r) => r.playerId)).toEqual(['s8', 's1', 's7', 's2', 's3', 's4', 's5', 's6', 'q9']);
    expect(rows[0]).toEqual({ playerId: 's8', place: 1, stageReached: 1 });
    expect(rows[8].stageReached).toBe(-1);
  });
});
