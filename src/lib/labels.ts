import { heatInfo } from '../engine/tournament';
import type { Tournament } from '../engine/types';
import { isKey, type Key, type Params } from '../i18n';

type T = (key: Key, params?: Params) => string;

export function stageName(t: T, name: string): string {
  return isKey(name) ? t(name) : name;
}

const LETTERS = 'ABCDEFGHIJKLMNOP';

export function heatTitle(t: T, tour: Tournament, heatId: string): string {
  const info = heatInfo(tour, heatId);
  if (!info) return '?';
  if (info.kind === 'qual') return t('heat.roundHeat', { r: info.roundIndex + 1, n: info.number });
  if (info.kind === 'lc') return t('stage.lastChance');
  const name = stageName(t, info.stageName);
  return info.of > 1 ? t('heat.stageHeat', { stage: name, letter: LETTERS[info.number - 1] }) : name;
}

export function formatDuration(t: T, minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return t('common.minutes', { n: m });
  return t('common.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 });
}

export function names(tour: Tournament, ids: string[]): string {
  return ids.map((id) => tour.players.find((p) => p.id === id)?.name ?? '?').join(', ');
}
