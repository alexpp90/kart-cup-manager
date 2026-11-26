// Knockout cups: the field is split into heats of at most S, the top X of each
// heat go on, and the next round is topped up with the best of the rest
// ("lucky losers") or through a Last Chance heat. Pure functions only.
//
// The size rule, shared by the planner and the live tournament:
//   A = advancers = Σ min(X, heat size) (+ byes)
//   F = min( ceil(A/S)·S,          fill the next round's heats completely
//            A + heats,            at most one fill-up per heat
//            field − heats )       the field always shrinks
// A field of S or fewer races the final (one heat).
import { evenSplit } from './heats';
import { snakeSeed } from './finals';
import { suddenDeathKey } from './ranking';
import { createRng, shuffle } from './rng';
import type { FillMode, HeatScore, Round, SuddenDeath } from './types';

export const defaultAdvance = (heatSize: number) => Math.max(1, Math.floor(heatSize / 2));

/** Heat sizes of a knockout round. Heat size 2 with an odd field gives one bye. */
export function koSplit(field: number, heatSize: number): { sizes: number[]; byes: number } {
  if (field <= heatSize) return { sizes: [field], byes: 0 };
  if (heatSize === 2 && field % 2 === 1) return { sizes: evenSplit(field - 1, 2), byes: 1 };
  return { sizes: evenSplit(field, heatSize), byes: 0 };
}

/** X may be 1 .. smallest heat − 1, so every heat knocks somebody out. */
export function clampAdvance(x: number, sizes: number[]): number {
  const smallest = Math.min(...sizes);
  return Math.max(1, Math.min(Math.round(x) || 1, smallest - 1));
}

export function nextFieldSize(field: number, sizes: number[], byes: number, x: number, fill: FillMode, heatSize: number): { advancers: number; target: number } {
  const advancers = sizes.reduce((a, s) => a + Math.min(x, s), 0) + byes;
  if (fill === 'off') return { advancers, target: advancers };
  const heats = sizes.length;
  const target = Math.min(Math.ceil(advancers / heatSize) * heatSize, advancers + heats, field - heats);
  return { advancers, target: Math.max(advancers, target) };
}

export interface KoPlanRound {
  field: number;
  sizes: number[];
  byes: number;
  final: boolean;
  /** Top X per heat (0 in the final). */
  advance: number;
  advancers: number;
  fillUps: number;
  /** Size of the Last Chance heat, 0 when there is none. */
  lastChance: number;
  /** Players in the next round. */
  next: number;
}

/** The whole knockout from `players` entrants on. `advance[i]` is X for round i. */
export function planKnockout(players: number, heatSize: number, advance: number[], fill: FillMode): KoPlanRound[] {
  const rounds: KoPlanRound[] = [];
  if (players < 2) return rounds;
  let field = players;
  for (let i = 0; i < 64; i++) {
    const { sizes, byes } = koSplit(field, heatSize);
    if (sizes.length === 1 && byes === 0) {
      rounds.push({ field, sizes, byes, final: true, advance: 0, advancers: 0, fillUps: 0, lastChance: 0, next: 0 });
      break;
    }
    const x = clampAdvance(advance[i] ?? defaultAdvance(heatSize), sizes);
    const { advancers, target } = nextFieldSize(field, sizes, byes, x, fill, heatSize);
    const fillUps = target - advancers;
    const rest = field - advancers;
    const pool = Math.min(heatSize, rest);
    const lastChance = fill === 'last-chance' && fillUps > 0 && pool > fillUps ? pool : 0;
    rounds.push({ field, sizes, byes, final: false, advance: x, advancers, fillUps, lastChance, next: target });
    field = target;
  }
  return rounds;
}

// ------------------------------------------------------------- live rounds

export interface Ranked extends HeatScore {
  /** Index of the heat in the round. */
  heat: number;
}

/** Order for the best of the rest: heat points, then place, then sudden death. */
export function restOrder(entries: Ranked[], suddenDeath: SuddenDeath[]): Ranked[] {
  const sdIndex = (id: string) => {
    for (const sd of suddenDeath) {
      const i = sd.order.indexOf(id);
      if (i !== -1) return i;
    }
    return 0;
  };
  return entries.slice().sort((a, b) => b.points - a.points || a.place - b.place || sdIndex(a.playerId) - sdIndex(b.playerId) || a.heat - b.heat);
}

/** Order of the advancers for seeding: heat place, then points. */
export function advancerOrder(entries: Ranked[]): Ranked[] {
  return entries.slice().sort((a, b) => a.place - b.place || b.points - a.points || a.heat - b.heat);
}

const same = (a: Ranked, b: Ranked) => a.points === b.points && a.place === b.place;

/**
 * A tie straddling the cut after the first `k` of `rest` that sudden death has
 * not decided yet: the whole tied group, or null.
 */
export function tieAtCut(rest: Ranked[], k: number, suddenDeath: SuddenDeath[]): string[] | null {
  if (k <= 0 || k >= rest.length || !same(rest[k - 1], rest[k])) return null;
  const group = rest.filter((r) => same(r, rest[k])).map((r) => r.playerId);
  const key = suddenDeathKey(group);
  return suddenDeath.some((s) => s.key === key) ? null : group;
}

export type KoOutcome =
  | { status: 'racing' }
  | { status: 'tie'; tie: string[] }
  | { status: 'last-chance'; pool: string[]; places: number }
  | { status: 'done'; advancing: string[]; luckyLosers: string[]; out: string[]; final: boolean };

export interface OutcomeInput {
  round: Round;
  heatSize: number;
  /** Scores per heat, null for unplayed heats. */
  scores: (HeatScore[] | null)[];
  lastChanceScores: HeatScore[] | null;
  withdrawn: Set<string>;
  suddenDeath: SuddenDeath[];
  defaultFill: FillMode;
}

/**
 * Who goes on from a knockout round. Advancers who withdrew after their heat
 * are replaced by the next best of the rest, also with fill-ups off.
 */
export function koOutcome(inp: OutcomeInput): KoOutcome {
  const { round, heatSize, scores, withdrawn, suddenDeath } = inp;
  if (!round.heats.length || scores.some((s) => !s)) return { status: 'racing' };
  const ranked: Ranked[] = scores.flatMap((sc, heat) => sc!.map((s) => ({ ...s, heat })));
  if (round.final) {
    const order = ranked.slice().sort((a, b) => a.place - b.place).map((r) => r.playerId);
    return { status: 'done', advancing: [], luckyLosers: [], out: order, final: true };
  }
  const sizes = round.heats.map((h) => h.playerIds.length);
  const x = clampAdvance(round.advance ?? defaultAdvance(heatSize), sizes);
  const fill = round.fill ?? inp.defaultFill;
  const field = sizes.reduce((a, b) => a + b, 0) + round.byes.length;
  const { target } = nextFieldSize(field, sizes, round.byes.length, x, fill, heatSize);
  const adv = advancerOrder(ranked.filter((r) => r.place <= x && !withdrawn.has(r.playerId)));
  const byes = round.byes.filter((id) => !withdrawn.has(id));
  const rest = restOrder(
    ranked.filter((r) => r.place > x && !withdrawn.has(r.playerId)),
    suddenDeath,
  );
  const need = Math.min(Math.max(0, target - adv.length - byes.length), rest.length);
  let lucky: string[] = [];
  if (need > 0 && fill === 'last-chance') {
    const poolSize = Math.min(heatSize, rest.length);
    const tie = tieAtCut(rest, poolSize, suddenDeath);
    if (tie) return { status: 'tie', tie };
    const pool = rest.slice(0, poolSize).map((r) => r.playerId);
    if (pool.length <= need) lucky = pool;
    else {
      // A raced Last Chance heat counts even if an edit changed the pool since;
      // an unraced one is rebuilt by syncKnockout when the pool changes.
      const lc = inp.lastChanceScores;
      if (!lc) return { status: 'last-chance', pool, places: need };
      lucky = lc
        .slice()
        .sort((a, b) => a.place - b.place)
        .map((s) => s.playerId)
        .filter((id) => !withdrawn.has(id))
        .slice(0, need);
    }
  } else if (need > 0) {
    const tie = tieAtCut(rest, need, suddenDeath);
    if (tie) return { status: 'tie', tie };
    lucky = rest.slice(0, need).map((r) => r.playerId);
  }
  const advancing = [...adv.map((r) => r.playerId), ...byes, ...lucky];
  const inNext = new Set(advancing);
  // Out: Last Chance losers by their Last Chance place first, then the rest in order, withdrawn last.
  const lcOrder = inp.lastChanceScores ? inp.lastChanceScores.slice().sort((a, b) => a.place - b.place).map((s) => s.playerId) : [];
  const restIds = rest.map((r) => r.playerId);
  const outOrdered = [...lcOrder.filter((id) => restIds.includes(id)), ...restIds];
  const out = [...new Set(outOrdered)].filter((id) => !inNext.has(id));
  const gone = ranked.map((r) => r.playerId).filter((id) => withdrawn.has(id));
  return { status: 'done', advancing, luckyLosers: lucky, out: [...out, ...gone, ...round.byes.filter((id) => withdrawn.has(id))], final: false };
}

/**
 * Heats of the next round from its seeded entrants. A field of S or fewer is
 * the final. Heat size 2 with an odd field: the top seed gets the bye.
 */
export function seedRound(entrants: string[], heatSize: number): { groups: string[][]; byes: string[]; final: boolean } {
  const { sizes, byes } = koSplit(entrants.length, heatSize);
  if (sizes.length === 1 && byes === 0) return { groups: [entrants.slice()], byes: [], final: true };
  const bye = entrants.slice(0, byes);
  // Bigger heats first in the play order, like round 1.
  const groups = snakeSeed(entrants.slice(byes), sizes.length)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.length - a.g.length || a.i - b.i)
    .map((x) => x.g);
  return { groups, byes: bye, final: false };
}

/** Round 1: a random draw. Heat size 2 with an odd field: a random player gets the bye. */
export function drawFirstRound(players: string[], heatSize: number, seed: number): { groups: string[][]; byes: string[]; final: boolean } {
  const order = shuffle(players, createRng(seed));
  const { sizes, byes } = koSplit(order.length, heatSize);
  if (sizes.length === 1 && byes === 0) return { groups: [order], byes: [], final: true };
  const bye = order.slice(0, byes);
  const rest = order.slice(byes);
  const groups: string[][] = [];
  let i = 0;
  for (const size of sizes) {
    groups.push(rest.slice(i, i + size));
    i += size;
  }
  return { groups, byes: bye, final: false };
}
