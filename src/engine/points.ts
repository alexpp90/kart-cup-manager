import type { Heat, HeatResult, HeatScore, Settings } from './types';

/** The game's points for places 1–8 in a race. */
export const DEFAULT_POINTS = [15, 12, 10, 9, 8, 7, 6, 5];
/** Version 1 defaults, kept so old backups are migrated with the table they used. */
export const LEGACY_POINTS_8 = [15, 12, 10, 8, 6, 4, 2, 1];
export const LEGACY_POINTS_4 = [10, 6, 3, 1];

export function pointsTable(settings: Pick<Settings, 'points'>): number[] {
  return settings.points;
}

/**
 * Points for a 1-based place. Smaller heats use the top of the table
 * (a 7-player heat awards 15…2), places beyond the table score 0.
 */
export function pointsForPlace(table: number[], place: number): number {
  return table[place - 1] ?? 0;
}

export type ValidationError =
  | { code: 'missing'; playerIds: string[]; race?: number }
  | { code: 'duplicate'; playerIds: string[]; race?: number }
  | { code: 'unknown'; playerIds: string[]; race?: number }
  | { code: 'race-count'; expected: number; actual: number }
  | { code: 'not-a-number'; playerIds: string[] }
  | { code: 'tie-unresolved'; playerIds: string[] };

/** A finishing order must contain every heat player exactly once. */
export function validateOrder(order: string[], playerIds: string[], race?: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const set = new Set(playerIds);
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  const unknown = order.filter((id) => !set.has(id));
  const missing = playerIds.filter((id) => !seen.has(id));
  if (missing.length) errors.push({ code: 'missing', playerIds: missing, race });
  if (dup.size) errors.push({ code: 'duplicate', playerIds: [...dup], race });
  if (unknown.length) errors.push({ code: 'unknown', playerIds: unknown, race });
  return errors;
}

/** Fill in the last finisher automatically once all but one player are placed. */
export function autoCompleteOrder(order: string[], playerIds: string[]): string[] {
  if (order.length !== playerIds.length - 1) return order;
  const rest = playerIds.filter((id) => !order.includes(id));
  return rest.length === 1 ? [...order, rest[0]] : order;
}

/** Running totals for per-race entry (also used for partially entered heats). */
export function perRaceTotals(races: string[][], playerIds: string[], table: number[]): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));
  for (const race of races) {
    race.forEach((id, i) => {
      if (id in totals) totals[id] += pointsForPlace(table, i + 1);
    });
  }
  return totals;
}

/**
 * Order players by heat total. Ties are broken by countback (more 1st places,
 * then more 2nd places, …) and finally by who finished ahead in the last race,
 * so a fully entered per-race heat always has a unique placing.
 */
export function orderPerRace(races: string[][], playerIds: string[], table: number[]): string[] {
  const totals = perRaceTotals(races, playerIds, table);
  const finishes = (id: string) => races.map((r) => r.indexOf(id));
  return playerIds.slice().sort((a, b) => {
    if (totals[b] !== totals[a]) return totals[b] - totals[a];
    for (let place = 0; place < playerIds.length; place++) {
      const ca = finishes(a).filter((p) => p === place).length;
      const cb = finishes(b).filter((p) => p === place).length;
      if (ca !== cb) return cb - ca;
    }
    for (let r = races.length - 1; r >= 0; r--) {
      const pa = races[r].indexOf(a);
      const pb = races[r].indexOf(b);
      if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    }
    return 0;
  });
}

/** Groups of players with equal console totals that the organizer must order by hand. */
export function totalsTieGroups(points: Record<string, number>, playerIds: string[]): string[][] {
  const byValue = new Map<number, string[]>();
  for (const id of playerIds) {
    const v = points[id];
    if (typeof v !== 'number' || Number.isNaN(v)) continue;
    byValue.set(v, [...(byValue.get(v) ?? []), id]);
  }
  return [...byValue.values()].filter((g) => g.length > 1);
}

/**
 * Default order for console totals: highest first, keeping the previous relative
 * order of tied players (so the organizer's manual tie order survives edits).
 */
export function orderFromTotals(points: Record<string, number>, playerIds: string[], previousOrder: string[] = []): string[] {
  const rank = (id: string) => {
    const i = previousOrder.indexOf(id);
    return i === -1 ? 1000 + playerIds.indexOf(id) : i;
  };
  return playerIds.slice().sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0) || rank(a) - rank(b));
}

export function validateResult(result: HeatResult, playerIds: string[], racesPerHeat: number): ValidationError[] {
  if (result.mode === 'ranking') return validateOrder(result.order, playerIds);
  if (result.mode === 'per-race') {
    const errors: ValidationError[] = [];
    if (result.races.length !== racesPerHeat) {
      errors.push({ code: 'race-count', expected: racesPerHeat, actual: result.races.length });
    }
    result.races.forEach((race, i) => errors.push(...validateOrder(race, playerIds, i + 1)));
    return errors;
  }
  const errors: ValidationError[] = [];
  const bad = playerIds.filter((id) => {
    const v = result.points[id];
    return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
  });
  if (bad.length) errors.push({ code: 'not-a-number', playerIds: bad });
  errors.push(...validateOrder(result.order, playerIds));
  if (!errors.length) {
    // The order must agree with the totals (higher total = better place).
    for (let i = 1; i < result.order.length; i++) {
      if (result.points[result.order[i]] > result.points[result.order[i - 1]]) {
        errors.push({ code: 'duplicate', playerIds: [result.order[i - 1], result.order[i]] });
        break;
      }
    }
  }
  return errors;
}

/**
 * Score a saved heat: points and unique 1-based place for each player.
 * 'ranking' entries score table[place] × races, the same scale as a cup where
 * you finished that place in every race.
 */
export function scoreHeat(heat: Heat, table: number[], races = 4): HeatScore[] | null {
  const r = heat.result;
  if (!r) return null;
  if (r.mode === 'ranking') return r.order.map((id, i) => ({ playerId: id, points: pointsForPlace(table, i + 1) * races, place: i + 1 }));
  if (r.mode === 'per-race') {
    const totals = perRaceTotals(r.races, heat.playerIds, table);
    return orderPerRace(r.races, heat.playerIds, table).map((id, i) => ({ playerId: id, points: totals[id], place: i + 1 }));
  }
  return r.order.map((id, i) => ({ playerId: id, points: r.points[id] ?? 0, place: i + 1 }));
}
