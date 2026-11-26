// The planner: what a tournament with n players looks like in each format,
// how long it takes, and cheaper variants when it runs too long. Pure and
// free of UI text; the screens turn the columns into words and diagrams.
import { heatCountOf, presetStages } from './finals';
import { splitHeatSizes } from './heats';
import { defaultAdvance, planKnockout } from './knockout';
import type { FillMode, Format, Settings } from './types';

/** One column of the diagram: a round (or repeated rounds) of heats. */
export interface PlanColumn {
  kind: 'qual' | 'stage' | 'ko' | 'final' | 'league';
  /** Knockout round number (0-based) or classic stage index. */
  index: number;
  /** Classic stage name (i18n key). */
  name?: string;
  sizes: number[];
  byes: number;
  /** How often this column is raced: qualifying rounds or league cups. */
  repeat: number;
  /** Top X per heat that go on (0 = nobody, e.g. the final). */
  advance: number;
  /** Extra places after the top X: lucky losers, wildcards. */
  fillUps: number;
  /** Size of the Last Chance heat in front of / after this column, 0 when none. */
  lastChance: number;
  /** Players in the next column. */
  next: number;
}

export type PlanWarning = 'long' | 'over-time' | 'too-few' | 'league-too-many' | 'classic-heat-size';

export interface Plan {
  format: Format;
  players: number;
  heatSize: number;
  columns: PlanColumn[];
  heats: number;
  minutesPerHeat: number;
  minutes: number;
  /** Average number of cups (heats) a player races. */
  cupsPerPlayer: number;
  warnings: PlanWarning[];
}

/** Settings the planner reads. */
export type PlanSettings = Pick<
  Settings,
  | 'format'
  | 'heatSize'
  | 'race'
  | 'qualRounds'
  | 'finalsFormat'
  | 'customStages'
  | 'lastChance'
  | 'lastChanceWildcards'
  | 'advance'
  | 'fill'
  | 'leagueCups'
  | 'minutesPerRace'
  | 'cupOverheadMinutes'
  | 'changeoverMinutes'
  | 'availableMinutes'
>;

/** Plans longer than this get a warning even without a time budget. */
export const LONG_MINUTES = 180;

/** Minutes for one heat raced with `race` (default: the next round's setup). */
export function minutesPerHeat(s: Pick<Settings, 'race' | 'minutesPerRace' | 'cupOverheadMinutes' | 'changeoverMinutes'>, races = s.race.races): number {
  return races * s.minutesPerRace + s.cupOverheadMinutes + s.changeoverMinutes;
}

/** League while everyone fits into one heat, knockout cups otherwise. */
export function suggestFormat(players: number, heatSize: number): Format {
  return players <= heatSize ? 'league' : 'knockout';
}

function columnsFor(players: number, s: PlanSettings): { columns: PlanColumn[]; warnings: PlanWarning[] } {
  const S = s.heatSize;
  const warnings: PlanWarning[] = [];
  const col = (c: Partial<PlanColumn> & Pick<PlanColumn, 'kind' | 'sizes'>): PlanColumn => ({ index: 0, byes: 0, repeat: 1, advance: 0, fillUps: 0, lastChance: 0, next: 0, ...c });
  if (s.format === 'league') {
    if (players < 2) return { columns: [], warnings: ['too-few'] };
    if (players > S) warnings.push('league-too-many');
    return { columns: [col({ kind: 'league', sizes: [players], repeat: Math.max(1, s.leagueCups) })], warnings };
  }
  if (s.format === 'knockout') {
    if (players < 2) return { columns: [], warnings: ['too-few'] };
    const rounds = planKnockout(players, S, s.advance, s.fill);
    return {
      columns: rounds.map((r, i) =>
        col({ kind: r.final ? 'final' : 'ko', index: i, sizes: r.sizes, byes: r.byes, advance: r.advance, fillUps: r.fillUps, lastChance: r.lastChance, next: r.next }),
      ),
      warnings,
    };
  }
  // Classic: qualifying rounds, then the finals preset (assuming everyone qualifies).
  if (S < 3) return { columns: [], warnings: ['classic-heat-size'] };
  const split = splitHeatSizes(players, S);
  if (!split.ok) return { columns: [], warnings: ['too-few'] };
  const columns = [col({ kind: 'qual', sizes: split.sizes, byes: split.byes, repeat: Math.max(1, s.qualRounds), next: players })];
  const stages = s.finalsFormat === 'custom' && s.customStages.length ? s.customStages : (presetStages(S, players, s.lastChance, s.lastChanceWildcards) ?? []);
  stages.forEach((st, i) => {
    const last = i === stages.length - 1;
    const heats = heatCountOf(st);
    columns.push(
      col({
        kind: last ? 'final' : 'stage',
        index: i,
        name: st.name,
        sizes: Array.from({ length: heats }, () => st.heatSize),
        advance: st.advancePerHeat,
        fillUps: st.wildcards,
        lastChance: st.wildcards > 0 ? Math.min(S, Math.max(0, (i === 0 ? players : stages[i - 1].fieldSize) - (st.fieldSize - st.wildcards))) : 0,
        next: last ? 0 : stages[i + 1].fieldSize,
      }),
    );
  });
  return { columns, warnings };
}

export function makePlan(players: number, s: PlanSettings): Plan {
  const { columns, warnings } = columnsFor(players, s);
  const heats = columns.reduce((a, c) => a + c.sizes.length * c.repeat + (c.lastChance ? 1 : 0), 0);
  const seats = columns.reduce((a, c) => a + c.sizes.reduce((x, y) => x + y, 0) * c.repeat + c.lastChance, 0);
  const perHeat = minutesPerHeat(s);
  const minutes = heats * perHeat;
  if (columns.length) {
    if (minutes > LONG_MINUTES) warnings.push('long');
    if (s.availableMinutes > 0 && minutes > s.availableMinutes) warnings.push('over-time');
  }
  return {
    format: s.format,
    players,
    heatSize: s.heatSize,
    columns,
    heats,
    minutesPerHeat: perHeat,
    minutes,
    cupsPerPlayer: players > 0 ? seats / players : 0,
    warnings,
  };
}

/** "HH:MM" plus minutes, wrapping past midnight. '' when no start time is set. */
export function endTime(start: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start);
  if (!m) return '';
  const total = (Number(m[1]) * 60 + Number(m[2]) + Math.round(minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export type AlternativeKind =
  | { kind: 'advance'; value: number }
  | { kind: 'fill'; value: FillMode }
  | { kind: 'cups'; value: number }
  | { kind: 'rounds'; value: number }
  | { kind: 'format'; value: Format };

export interface Alternative {
  change: AlternativeKind;
  patch: Partial<Settings>;
  plan: Plan;
  /** Minutes saved against the current plan. */
  saves: number;
}

/**
 * Cheaper variants of the current settings, computed rather than written by
 * hand: fewer advancing per heat, no fill-ups or no Last Chance, fewer cups or
 * rounds, knockout instead of classic. Variants that fit the time budget come
 * first, then the ones where players race the most cups.
 */
export function alternatives(players: number, s: PlanSettings, limit = 4): Alternative[] {
  const base = makePlan(players, s);
  if (!base.columns.length) return [];
  const candidates: { change: AlternativeKind; patch: Partial<Settings> }[] = [];
  if (s.format === 'knockout') {
    const xs = base.columns.filter((c) => c.kind === 'ko').map((c) => c.advance);
    const top = Math.max(0, ...xs);
    for (let v = top - 1; v >= 1; v--) candidates.push({ change: { kind: 'advance', value: v }, patch: { advance: xs.map(() => v) } });
    if (s.fill === 'last-chance') candidates.push({ change: { kind: 'fill', value: 'best' }, patch: { fill: 'best' } });
    if (s.fill !== 'off') candidates.push({ change: { kind: 'fill', value: 'off' }, patch: { fill: 'off' } });
  }
  if (s.format === 'league') for (let c = s.leagueCups - 1; c >= 1; c--) candidates.push({ change: { kind: 'cups', value: c }, patch: { leagueCups: c } });
  if (s.format === 'classic') {
    for (let r = s.qualRounds - 1; r >= 1; r--) candidates.push({ change: { kind: 'rounds', value: r }, patch: { qualRounds: r } });
    if (players > s.heatSize) candidates.push({ change: { kind: 'format', value: 'knockout' }, patch: { format: 'knockout' } });
  }
  const budget = s.availableMinutes > 0 ? s.availableMinutes : LONG_MINUTES;
  return candidates
    .map((c) => {
      const plan = makePlan(players, { ...s, ...c.patch });
      return { ...c, plan, saves: base.minutes - plan.minutes };
    })
    .filter((a) => a.saves > 0 && a.plan.columns.length > 0)
    .sort((a, b) => Number(b.plan.minutes <= budget) - Number(a.plan.minutes <= budget) || b.plan.cupsPerPlayer - a.plan.cupsPerPlayer || a.plan.minutes - b.plan.minutes)
    .slice(0, limit);
}

/** X used for knockout round i under these settings (before clamping to the heat sizes). */
export function advanceFor(s: Pick<Settings, 'advance' | 'heatSize'>, round: number): number {
  return s.advance[round] ?? defaultAdvance(s.heatSize);
}
