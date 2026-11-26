import { heatInfo, roundOutcome } from '../engine/tournament';
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
  if (info.kind === 'qual') {
    if (tour.settings.format === 'league') return t('heat.cup', { n: info.roundIndex + 1 });
    if (info.final) return t('stage.final');
    return info.of > 1 ? t('heat.roundHeat', { r: info.roundIndex + 1, n: info.number }) : t('phase.roundLong', { n: info.roundIndex + 1 });
  }
  if (info.kind === 'rlc') return t('heat.lastChanceRound', { r: info.roundIndex + 1 });
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

/** Name of round i: "Round 2", "Final" (knockout) or "Cup 2" (league). */
export function roundLabel(t: T, tour: Tournament, index: number): string {
  if (tour.settings.format === 'league') return t('heat.cup', { n: index + 1 });
  if (tour.settings.format === 'knockout' && tour.rounds[index]?.final) return t('stage.final');
  return t('phase.roundLong', { n: index + 1 });
}

/** "ends ≈ 22:10" style clock time in the current language. */
export function clockTime(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}

/** Label of the button that creates the next round in this format. */
export function nextRoundLabel(t: T, tour: Tournament): string {
  const n = tour.rounds.length + 1;
  if (tour.settings.format === 'league') return t('home.startCup', { n });
  if (tour.settings.format === 'knockout') {
    if (!tour.rounds.length) return t('home.drawRound1');
    const prev = tour.rounds[tour.rounds.length - 1];
    const o = roundOutcome(tour, prev);
    if (o.status === 'done' && o.advancing.length <= tour.settings.heatSize) return t('home.generateFinal');
    return t('home.generateNext', { n });
  }
  return tour.rounds.length ? t('home.generateNext', { n }) : t('home.generateFirst');
}
