import { finalsPlan } from '../engine/tournament';
import type { Tournament } from '../engine/types';

/** Who is (currently) in the finals and who is in the Last Chance pool. */
export function qualificationMarks(tour: Tournament): { direct: Set<string>; lastChance: Set<string>; cut: number; lcCount: number } {
  if (tour.finals) {
    const s0 = tour.finals.stages[0];
    const directIds = s0.seeds.slice(0, s0.config.fieldSize - s0.config.wildcards);
    return { direct: new Set(directIds), lastChance: new Set(s0.lastChance?.playerIds ?? []), cut: directIds.length, lcCount: s0.lastChance?.playerIds.length ?? 0 };
  }
  const plan = finalsPlan(tour);
  if (!plan.stages || plan.errors.length) return { direct: new Set(), lastChance: new Set(), cut: 0, lcCount: 0 };
  const first = plan.stages[0];
  const cut = first.fieldSize - first.wildcards;
  const lcCount = first.wildcards > 0 ? Math.min(plan.eligible.length - cut, tour.settings.maxPerHeat) : 0;
  const ids = plan.eligible.map((r) => r.playerId);
  return { direct: new Set(ids.slice(0, cut)), lastChance: new Set(ids.slice(cut, cut + lcCount)), cut, lcCount };
}
