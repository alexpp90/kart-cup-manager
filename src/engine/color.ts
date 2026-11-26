import { COLORS } from '../data/colors';
import type { Player } from './types';

/** The palette colour used by the fewest players still in the event (first one on a tie). */
export function pickColor(players: Pick<Player, 'color' | 'status'>[]): string {
  const counts = COLORS.map((c) => players.filter((p) => p.status !== 'withdrawn' && p.color.toLowerCase() === c.toLowerCase()).length);
  const min = Math.min(...counts);
  return COLORS[counts.indexOf(min)];
}
