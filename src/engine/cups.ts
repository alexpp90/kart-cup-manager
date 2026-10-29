import type { Cup } from '../data/cups';
import { shuffle, type Rng } from './rng';
import type { CupPick, Heat } from './types';

export interface Track {
  id: string; // `${cupId}:${index}`
  name: string;
  cupId: string;
}

export function cupPool(cups: Cup[], boosterPass: boolean): Cup[] {
  return cups.filter((c) => boosterPass || !c.booster);
}

export function trackPool(cups: Cup[]): Track[] {
  return cups.flatMap((c) => c.tracks.map((name, i) => ({ id: `${c.id}:${i}`, name, cupId: c.id })));
}

/** Cups and tracks already used by any heat so far. */
export function usedFromHeats(heats: Heat[]): { cups: string[]; tracks: string[] } {
  const cups: string[] = [];
  const tracks: string[] = [];
  for (const h of heats) {
    if (h.cup?.kind === 'cup') cups.push(h.cup.cupId);
    if (h.cup?.kind === 'tracks') tracks.push(...h.cup.trackIds);
  }
  return { cups, tracks };
}

/**
 * Items not yet used in the current cycle. Once every item has been used the
 * cycle restarts, so nothing repeats until all have been played.
 */
export function remainingInCycle(all: string[], used: string[]): string[] {
  const counts = new Map<string, number>();
  for (const u of used) if (all.includes(u)) counts.set(u, (counts.get(u) ?? 0) + 1);
  const min = Math.min(...all.map((id) => counts.get(id) ?? 0));
  return all.filter((id) => (counts.get(id) ?? 0) === min);
}

export function pickRandomCup(pool: Cup[], usedCupIds: string[], rng: Rng): CupPick {
  const remaining = remainingInCycle(pool.map((c) => c.id), usedCupIds);
  return { kind: 'cup', cupId: remaining[Math.floor(rng() * remaining.length)] };
}

export function pickRandomTracks(pool: Track[], usedTrackIds: string[], count: number, rng: Rng): CupPick {
  const picked: string[] = [];
  const used = usedTrackIds.slice();
  for (let i = 0; i < count; i++) {
    const remaining = remainingInCycle(pool.map((t) => t.id), used).filter((id) => !picked.includes(id));
    const options = remaining.length ? remaining : pool.map((t) => t.id).filter((id) => !picked.includes(id));
    const id = shuffle(options, rng)[0];
    picked.push(id);
    used.push(id);
  }
  return { kind: 'tracks', trackIds: picked };
}
