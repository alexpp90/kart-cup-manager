import { heatCountOf, presetStages } from './finals';
import { splitHeatSizes } from './heats';
import type { Settings } from './types';

export interface Estimate {
  qualHeats: number;
  finalsHeats: number;
  minutesPerHeat: number;
  totalMinutes: number;
}

/** heats × races × minutes per race + changeover per heat. */
export function estimateDuration(players: number, s: Settings): Estimate {
  const split = splitHeatSizes(players, s.maxPerHeat);
  const perRound = split.ok ? split.sizes.length : 0;
  const qualHeats = perRound * s.qualRounds;
  const stages =
    s.finalsFormat === 'custom' && s.customStages.length
      ? s.customStages
      : presetStages(s.maxPerHeat, players, s.lastChance, s.lastChanceWildcards) ?? [];
  const finalsHeats = stages.reduce((n, st) => n + heatCountOf(st) + (st.wildcards > 0 ? 1 : 0), 0);
  const minutesPerHeat = s.racesPerHeat * s.minutesPerRace + s.changeoverMinutes;
  return { qualHeats, finalsHeats, minutesPerHeat, totalMinutes: (qualHeats + finalsHeats) * minutesPerHeat };
}
