import { AVATARS, COLORS } from '../data/avatars';
import { pointsForPlace, orderFromTotals } from './points';
import { createRng, shuffle, type Rng } from './rng';
import type { Heat, HeatResult, Settings } from './types';
import { addPlayer, commitRound, createTournament, defaultSettings, previewRound, randomCupFor, saveHeatResult, setHeatCup, type IdGen } from './tournament';
import type { Tournament } from './types';

export const DEMO_NAMES = [
  'Blitz Bianca', 'Turbo Tim', 'Drift Queen', 'Captain Kart', 'Nitro Nina', 'Shell Shock', 'Banana Ben', 'Lightning Lena',
  'Max Boost', 'Coin Collector', 'Rainbow Rider', 'Sir Skids-a-Lot', 'Pole Position Pia', 'Mini Turbo', 'Hairpin Hans',
  'Slipstream Sam', 'Lucky Lou', 'Grip Grace', 'Apex Anton', 'Rocket Rosa', 'Chicane Charlie', 'Wheelie Willi',
  'Burnout Bea', 'Fast Fritz', 'Checkered Chloe', 'Lap Leader Leo', 'Spin-Out Sophie', 'Gearbox Greta', 'Pitstop Paul',
  'Throttle Theo', 'Overtake Olga', 'Podium Pete',
];

/** Simulated finishing orders: each player has a skill, each race adds noise. */
export function simulateResult(heat: Heat, settings: Settings, skill: (id: string) => number, rng: Rng): HeatResult {
  const races = Array.from({ length: settings.racesPerHeat }, () =>
    heat.playerIds
      .map((id) => ({ id, v: skill(id) + rng() * 6 }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.id),
  );
  if (settings.entryMode === 'per-race') return { mode: 'per-race', races };
  const table = settings.maxPerHeat === 8 ? settings.points8 : settings.points4;
  const points: Record<string, number> = Object.fromEntries(heat.playerIds.map((id) => [id, 0]));
  for (const r of races) r.forEach((id, i) => (points[id] += pointsForPlace(table, i + 1)));
  return { mode: 'totals', points, order: orderFromTotals(points, heat.playerIds, races[races.length - 1]) };
}

export function skillFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 100;
}

/** 30 fake players and one fully simulated qualifying round. */
export function buildDemo(newId: IdGen, now: number, opts: { players?: number; max?: 4 | 8; roundsPlayed?: number } = {}): Tournament {
  const rng = createRng(now);
  const settings: Settings = { ...defaultSettings(), name: 'Demo Kart Cup', maxPerHeat: opts.max ?? 8, trackMode: 'random-cup' };
  let t = createTournament(settings, newId(), now);
  const names = shuffle(DEMO_NAMES, rng).slice(0, opts.players ?? 30);
  names.forEach((name, i) => {
    const r = addPlayer(t, { name, avatar: AVATARS[i % AVATARS.length].id, color: COLORS[i % (COLORS.length - 1)], status: 'checked-in' }, newId(), now);
    if (r.ok) t = r.t;
  });
  for (let k = 0; k < (opts.roundsPlayed ?? 1); k++) {
    const p = previewRound(t, now + k, newId, now);
    if (!p.ok) break;
    t = commitRound(t, p.round);
    for (const h of p.round.heats) {
      t = setHeatCup(t, h.id, randomCupFor(t, Math.floor(rng() * 2 ** 31)));
      t = saveHeatResult(t, h.id, simulateResult(h, settings, skillFor, rng), now, newId);
    }
  }
  return t;
}
