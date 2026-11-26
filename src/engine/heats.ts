import type { HeatMax } from './types';

export const MIN_HEAT_SIZE = 3;

export type SplitResult =
  | { ok: true; sizes: number[]; byes: number }
  | { ok: false; reason: 'too-few-players' };

/**
 * Classic qualifying: split n players into heats of at most `max` (3..8).
 * heats = ceil(n / max); sizes differ by at most 1, largest heats first.
 * A heat may never have fewer than 3 players. Because ceil() already gives the
 * minimum number of heats, the only way to rebalance is to give byes: the
 * smallest number of players sit out this round (only happens for n = 5 at max 4).
 */
export function splitHeatSizes(n: number, max: HeatMax): SplitResult {
  if (n < MIN_HEAT_SIZE) return { ok: false, reason: 'too-few-players' };
  for (let byes = 0; byes <= n - MIN_HEAT_SIZE; byes++) {
    const sizes = evenSplit(n - byes, max);
    if (sizes.every((s) => s >= MIN_HEAT_SIZE)) return { ok: true, sizes, byes };
  }
  return { ok: false, reason: 'too-few-players' };
}

/** ceil(n / max) heats, sizes differ by at most 1, largest first. */
export function evenSplit(n: number, max: number): number[] {
  const heats = Math.ceil(n / max);
  const base = Math.floor(n / heats);
  const extra = n % heats;
  return Array.from({ length: heats }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Can this set of heat sizes be played? Used when the organizer moves players around. */
export function sizesAreValid(sizes: number[], max: HeatMax, allowedSpread = 1, min = MIN_HEAT_SIZE): boolean {
  if (sizes.length === 0) return true;
  if (sizes.some((s) => s < min || s > max)) return false;
  return Math.max(...sizes) - Math.min(...sizes) <= allowedSpread;
}
