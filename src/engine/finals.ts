import { MIN_HEAT_SIZE } from './heats';
import type { FinalsStage, HeatMax, HeatScore, StageConfig } from './types';

export type StageError =
  | { code: 'no-stages' }
  | { code: 'heat-size'; stage: number; min: number; max: number }
  | { code: 'not-divisible'; stage: number }
  | { code: 'advance'; stage: number }
  | { code: 'final-single-heat'; stage: number }
  | { code: 'field-mismatch'; stage: number; expected: number }
  | { code: 'not-enough-players'; stage: number; needed: number; available: number }
  | { code: 'wildcards'; stage: number }
  | { code: 'last-chance-pool'; stage: number; pool: number };

export function heatCountOf(stage: StageConfig): number {
  return stage.fieldSize / stage.heatSize;
}

/** Players knocked out of a stage (they form the pool for the next Last Chance heat). */
export function eliminatedCount(stage: StageConfig): number {
  return stage.fieldSize - heatCountOf(stage) * stage.advancePerHeat;
}

/**
 * Check that a list of stages adds up:
 * every stage splits evenly into heats, each non-final stage advances fewer than
 * a full heat, the next stage's field equals advancers + wildcards, the last
 * stage is one heat, and Last Chance pools are big enough for a real heat.
 */
export function validateStages(stages: StageConfig[], opts: { heatSize: HeatMax; eligible: number }): StageError[] {
  const errors: StageError[] = [];
  if (!stages.length) return [{ code: 'no-stages' }];
  stages.forEach((s, i) => {
    const last = i === stages.length - 1;
    if (!Number.isInteger(s.heatSize) || s.heatSize < MIN_HEAT_SIZE || s.heatSize > opts.heatSize) {
      errors.push({ code: 'heat-size', stage: i, min: MIN_HEAT_SIZE, max: opts.heatSize });
      return;
    }
    if (!Number.isInteger(s.fieldSize) || s.fieldSize <= 0 || s.fieldSize % s.heatSize !== 0) {
      errors.push({ code: 'not-divisible', stage: i });
      return;
    }
    if (last) {
      if (heatCountOf(s) !== 1) errors.push({ code: 'final-single-heat', stage: i });
      if (s.advancePerHeat !== 0) errors.push({ code: 'advance', stage: i });
    } else if (!Number.isInteger(s.advancePerHeat) || s.advancePerHeat < 1 || s.advancePerHeat >= s.heatSize) {
      errors.push({ code: 'advance', stage: i });
    }
    if (!Number.isInteger(s.wildcards) || s.wildcards < 0 || s.wildcards > 2 || s.wildcards >= s.fieldSize) {
      errors.push({ code: 'wildcards', stage: i });
    }
    const lcMin = Math.max(MIN_HEAT_SIZE, s.wildcards + 1);
    if (i === 0) {
      const direct = s.fieldSize - s.wildcards;
      if (direct > opts.eligible) {
        errors.push({ code: 'not-enough-players', stage: i, needed: direct, available: opts.eligible });
      } else if (s.wildcards > 0 && opts.eligible - direct < lcMin) {
        errors.push({ code: 'last-chance-pool', stage: i, pool: opts.eligible - direct });
      }
    } else {
      const prev = stages[i - 1];
      if (prev.heatSize > 0 && prev.fieldSize % prev.heatSize === 0) {
        const expected = heatCountOf(prev) * prev.advancePerHeat + s.wildcards;
        if (s.fieldSize !== expected) errors.push({ code: 'field-mismatch', stage: i, expected });
        if (s.wildcards > 0 && eliminatedCount(prev) < lcMin) {
          errors.push({ code: 'last-chance-pool', stage: i, pool: eliminatedCount(prev) });
        }
      }
    }
  });
  return errors;
}

const st = (name: string, fieldSize: number, heatSize: number, advancePerHeat: number, wildcards = 0): StageConfig => ({
  name,
  fieldSize,
  heatSize,
  advancePerHeat,
  wildcards,
});

/**
 * Pick the finals format for the number of eligible players.
 * Stage names are i18n keys (finals.semi, finals.grand, …). The presets for
 * heat sizes 8 and 4 are the version 1 presets, unchanged. Other sizes use two
 * semi-finals of S where the top half goes on, then one final.
 */
export function presetStages(max: HeatMax, eligible: number, lastChance = false, wildcards: 1 | 2 = 2): StageConfig[] | null {
  if (eligible < MIN_HEAT_SIZE) return null;
  let stages: StageConfig[];
  if (max === 8) {
    if (eligible >= 16) stages = [st('stage.semi', 16, 8, 4), st('stage.grand', 8, 8, 0)];
    else if (eligible >= 12) stages = [st('stage.semi', 12, 6, 4), st('stage.grand', 8, 8, 0)];
    else if (eligible >= 8) stages = [st('stage.grand', 8, 8, 0)];
    else stages = [st('stage.grand', eligible, eligible, 0)];
  } else if (max === 4) {
    if (eligible >= 16) stages = [st('stage.quarter', 16, 4, 2), st('stage.semi', 8, 4, 2), st('stage.final', 4, 4, 0)];
    else if (eligible >= 8) stages = [st('stage.semi', 8, 4, 2), st('stage.final', 4, 4, 0)];
    else if (eligible >= 4) stages = [st('stage.final', 4, 4, 0)];
    else stages = [st('stage.final', eligible, eligible, 0)];
  } else {
    const half = Math.floor(max / 2);
    if (eligible >= 2 * max && 2 * half >= MIN_HEAT_SIZE) stages = [st('stage.semi', 2 * max, max, half), st('stage.final', 2 * half, 2 * half, 0)];
    else if (eligible >= max) stages = [st('stage.final', max, max, 0)];
    else stages = [st('stage.final', eligible, eligible, 0)];
  }
  if (lastChance) {
    const first = stages[0];
    const pool = eligible - (first.fieldSize - wildcards);
    if (pool >= Math.max(MIN_HEAT_SIZE, wildcards + 1)) stages[0] = { ...first, wildcards };
  }
  return stages;
}

/**
 * Snake seeding: seeds 1..N dealt into heats A, B, B, A, A, B…
 * With 2 heats: A = 1, 4, 5, 8…  B = 2, 3, 6, 7…
 */
export function snakeSeed<T>(seeds: T[], heatCount: number): T[][] {
  const heats: T[][] = Array.from({ length: heatCount }, () => []);
  seeds.forEach((s, i) => {
    const row = Math.floor(i / heatCount);
    const col = i % heatCount;
    heats[row % 2 === 0 ? col : heatCount - 1 - col].push(s);
  });
  return heats;
}

/** Order players coming out of a set of heats: heat place first, then points, then original seed. */
function orderOutcome(entries: { score: HeatScore; seed: number }[]): string[] {
  return entries
    .slice()
    .sort((a, b) => a.score.place - b.score.place || b.score.points - a.score.points || a.seed - b.seed)
    .map((e) => e.score.playerId);
}

export function splitStageOutcome(stage: FinalsStage, scored: HeatScore[][]): { advancing: string[]; eliminated: string[] } {
  const seedIdx = (id: string) => {
    const i = stage.seeds.indexOf(id);
    return i === -1 ? 999 : i;
  };
  const adv: { score: HeatScore; seed: number }[] = [];
  const out: { score: HeatScore; seed: number }[] = [];
  for (const heat of scored) {
    for (const s of heat) (s.place <= stage.config.advancePerHeat ? adv : out).push({ score: s, seed: seedIdx(s.playerId) });
  }
  return { advancing: orderOutcome(adv), eliminated: orderOutcome(out) };
}

/** Last Chance heat winners: the best `wildcards` of the heat. */
export function lastChanceWinners(scores: HeatScore[], wildcards: number): string[] {
  return scores
    .slice()
    .sort((a, b) => a.place - b.place)
    .slice(0, wildcards)
    .map((s) => s.playerId);
}

export interface FinalRow {
  playerId: string;
  place: number;
  /** Index of the furthest finals stage reached, -1 = qualifying only. */
  stageReached: number;
}

/**
 * Final standings: Grand Final placings decide 1st..kth, then players knocked
 * out earlier (later stages first), then Last Chance losers, then everyone else
 * in qualifying order.
 */
export function finalStandings(
  stages: FinalsStage[],
  scoredByStage: (HeatScore[][] | null)[],
  lastChanceScores: (HeatScore[] | null)[],
  qualifyingOrder: string[],
): FinalRow[] {
  const placed: FinalRow[] = [];
  const seen = new Set<string>();
  const push = (id: string, stageReached: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    placed.push({ playerId: id, place: placed.length + 1, stageReached });
  };
  for (let i = stages.length - 1; i >= 0; i--) {
    const scored = scoredByStage[i];
    if (!scored) continue;
    const { advancing, eliminated } = splitStageOutcome(stages[i], scored);
    if (i === stages.length - 1) advancing.concat(eliminated).forEach((id) => push(id, i));
    else eliminated.forEach((id) => push(id, i));
  }
  for (let i = stages.length - 1; i >= 0; i--) {
    const lc = lastChanceScores[i];
    if (lc) lc.slice().sort((a, b) => a.place - b.place).forEach((s) => push(s.playerId, i - 1));
  }
  qualifyingOrder.forEach((id) => push(id, -1));
  return placed;
}
