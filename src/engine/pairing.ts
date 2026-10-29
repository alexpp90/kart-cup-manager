import { createRng, shuffle, type Rng } from './rng';

export type PairHistory = Map<string, number>;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Count how often every pair of players has shared a heat. */
export function buildPairHistory(groups: string[][]): PairHistory {
  const h: PairHistory = new Map();
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const k = pairKey(g[i], g[j]);
        h.set(k, (h.get(k) ?? 0) + 1);
      }
    }
  }
  return h;
}

/**
 * Repeat score of a proposed round: for every pair that shares a heat, add the
 * square of how often they already met. 0 = nobody meets anyone twice.
 * Squaring makes a third meeting far worse than two second meetings.
 */
export function repeatScore(groups: string[][], history: PairHistory): number {
  let score = 0;
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const c = history.get(pairKey(g[i], g[j])) ?? 0;
        score += c * c;
      }
    }
  }
  return score;
}

/** Number of pairs in the proposal that have met before (for display). */
export function repeatedPairs(groups: string[][], history: PairHistory): number {
  let n = 0;
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) if ((history.get(pairKey(g[i], g[j])) ?? 0) > 0) n++;
    }
  }
  return n;
}

export interface PairingInput {
  players: string[];
  sizes: number[];
  history: PairHistory;
  /** Current ranking, best first. Empty in round 1 (no seeding). */
  seedOrder?: string[];
  /** Players who raced in the previous round's last heat: keep them out of heat 1. */
  avoidFirst?: string[];
  seed: number;
  tries?: number;
}

export interface PairingResult {
  groups: string[][]; // in play order
  score: number;
  repeatScore: number;
  repeatedPairs: number;
  backToBack: number;
  seedConflicts: number;
}

// Weights: a repeated meeting is the main cost, a back-to-back heat is cheaper
// than a repeat ("where possible"), seeding is only a light nudge.
const W_BACK_TO_BACK = 0.5;
const W_SEED = 0.3;
const SEEDED_TIERS = 2;

export function generatePairing(input: PairingInput): PairingResult {
  const { players, sizes, history } = input;
  const tries = input.tries ?? 200;
  const rng = createRng(input.seed);
  const avoid = new Set(input.avoidFirst ?? []);
  const heatCount = sizes.length;
  const tierOf = buildTiers(players, input.seedOrder ?? [], heatCount);

  let best: string[][] | null = null;
  let bestScore = Infinity;
  for (let t = 0; t < tries; t++) {
    const groups = greedyPass(players, sizes, history, tierOf, avoid, heatCount, rng);
    const s = totalScore(groups, history, tierOf, avoid);
    if (s < bestScore) {
      bestScore = s;
      best = groups;
      if (s === 0) break;
    }
  }
  let groups = improveBySwaps(best ?? [], history, tierOf, avoid);
  groups = orderForBackToBack(groups, avoid);
  return {
    groups,
    score: totalScore(groups, history, tierOf, avoid),
    repeatScore: repeatScore(groups, history),
    repeatedPairs: repeatedPairs(groups, history),
    backToBack: groups.length ? groups[0].filter((p) => avoid.has(p)).length : 0,
    seedConflicts: seedConflicts(groups, tierOf),
  };
}

function buildTiers(players: string[], seedOrder: string[], heatCount: number): Map<string, number> {
  const tiers = new Map<string, number>();
  if (!seedOrder.length) return tiers;
  const ranked = seedOrder.filter((id) => players.includes(id));
  ranked.forEach((id, i) => tiers.set(id, Math.floor(i / heatCount)));
  return tiers;
}

function greedyPass(
  players: string[],
  sizes: number[],
  history: PairHistory,
  tierOf: Map<string, number>,
  avoid: Set<string>,
  heatCount: number,
  rng: Rng,
): string[][] {
  // Strongest tiers are placed first so they spread out; everybody else in random order.
  let order: string[];
  if (tierOf.size) {
    const byTier = new Map<number, string[]>();
    const unranked: string[] = [];
    for (const p of players) {
      const t = tierOf.get(p);
      if (t === undefined) unranked.push(p);
      else byTier.set(t, [...(byTier.get(t) ?? []), p]);
    }
    order = [...byTier.keys()].sort((a, b) => a - b).flatMap((t) => shuffle(byTier.get(t)!, rng));
    order.push(...shuffle(unranked, rng));
  } else {
    order = shuffle(players, rng);
  }
  const groups: string[][] = sizes.map(() => []);
  // Randomise which heat gets which size so the "first heat" isn't always a big one.
  const caps = shuffle(sizes, rng);
  for (const p of order) {
    let bestCost = Infinity;
    let choices: number[] = [];
    for (let h = 0; h < heatCount; h++) {
      if (groups[h].length >= caps[h]) continue;
      const cost = placementCost(p, groups[h], h, history, tierOf, avoid);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        choices = [h];
      } else if (Math.abs(cost - bestCost) < 1e-9) {
        choices.push(h);
      }
    }
    const h = choices[Math.floor(rng() * choices.length)];
    groups[h].push(p);
  }
  return groups;
}

function placementCost(
  p: string,
  group: string[],
  heatIndex: number,
  history: PairHistory,
  tierOf: Map<string, number>,
  avoid: Set<string>,
): number {
  let cost = 0;
  for (const m of group) {
    const c = history.get(pairKey(p, m)) ?? 0;
    cost += c * c;
  }
  if (heatIndex === 0 && avoid.has(p)) cost += W_BACK_TO_BACK;
  const t = tierOf.get(p);
  if (t !== undefined && t < SEEDED_TIERS && group.some((m) => tierOf.get(m) === t)) cost += W_SEED;
  return cost;
}

function seedConflicts(groups: string[][], tierOf: Map<string, number>): number {
  let n = 0;
  for (const g of groups) {
    const counts = new Map<number, number>();
    for (const p of g) {
      const t = tierOf.get(p);
      if (t !== undefined && t < SEEDED_TIERS) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const c of counts.values()) n += Math.max(0, c - 1);
  }
  return n;
}

function totalScore(groups: string[][], history: PairHistory, tierOf: Map<string, number>, avoid: Set<string>): number {
  const b2b = groups.length ? groups[0].filter((p) => avoid.has(p)).length : 0;
  return repeatScore(groups, history) + W_BACK_TO_BACK * b2b + W_SEED * seedConflicts(groups, tierOf);
}

/** Cheap local search on the best greedy result: keep swapping two players while it helps. */
function improveBySwaps(groups: string[][], history: PairHistory, tierOf: Map<string, number>, avoid: Set<string>): string[][] {
  const g = groups.map((x) => x.slice());
  let current = totalScore(g, history, tierOf, avoid);
  for (let pass = 0; pass < 4 && current > 0; pass++) {
    let improved = false;
    for (let a = 0; a < g.length; a++) {
      for (let b = a + 1; b < g.length; b++) {
        for (let i = 0; i < g[a].length; i++) {
          for (let j = 0; j < g[b].length; j++) {
            [g[a][i], g[b][j]] = [g[b][j], g[a][i]];
            const s = totalScore(g, history, tierOf, avoid);
            if (s < current - 1e-9) {
              current = s;
              improved = true;
            } else {
              [g[a][i], g[b][j]] = [g[b][j], g[a][i]];
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  return g;
}

/** Play first the heat with the fewest players from the previous round's last heat. */
function orderForBackToBack(groups: string[][], avoid: Set<string>): string[][] {
  if (!avoid.size || groups.length < 2) return groups;
  let bestIdx = 0;
  let bestOverlap = Infinity;
  groups.forEach((g, i) => {
    const o = g.filter((p) => avoid.has(p)).length;
    if (o < bestOverlap) {
      bestOverlap = o;
      bestIdx = i;
    }
  });
  return [groups[bestIdx], ...groups.filter((_, i) => i !== bestIdx)];
}
