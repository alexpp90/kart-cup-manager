import { isPlayed, upcoming } from '../engine/tournament';
import type { Heat, Tournament } from '../engine/types';

export type HeatStatus = 'done' | 'now' | 'next' | 'ready' | 'waiting';

export function heatStatus(tour: Tournament, heat: Heat): HeatStatus {
  if (isPlayed(heat)) return 'done';
  const i = upcoming(tour).findIndex((h) => h.id === heat.id);
  return i === 0 ? 'now' : i === 1 ? 'next' : i === 2 ? 'ready' : 'waiting';
}
