// Pure state transitions on a Tournament. Every function returns a new object
// and never mutates its input, so the store can snapshot freely for undo.
import { COLORS } from '../data/colors';
import { CUPS } from '../data/cups';
import { pickColor } from './color';
import { cupPool, pickRandomCup, pickRandomTracks, trackPool, usedFromHeats } from './cups';
import { eliminatedCount, heatCountOf, lastChanceWinners, presetStages, snakeSeed, splitStageOutcome, validateStages, finalStandings, type FinalRow, type StageError } from './finals';
import { MIN_HEAT_SIZE, sizesAreValid, splitHeatSizes } from './heats';
import { drawFirstRound, koOutcome, seedRound, type KoOutcome } from './knockout';
import { leaguePodiumTie, leagueStandings, type LeagueRow } from './league';
import { buildPairHistory, generatePairing, type PairingResult } from './pairing';
import { advanceFor } from './plan';
import { DEFAULT_POINTS, pointsTable, scoreHeat } from './points';
import { computeStandings, minHeatsForFinals, tieAcrossCut, type ScoredHeat, type StandingRow } from './ranking';
import { createRng, hashString, randomId, shuffle } from './rng';
import type { CupPick, FinalsStage, Heat, HeatResult, HeatScore, Phase, Player, PlayerStatus, RaceSetup, Round, Settings, StageConfig, SuddenDeath, Tournament } from './types';

export type IdGen = () => string;

export function defaultSettings(): Settings {
  return {
    name: 'Kart Cup',
    date: new Date().toISOString().slice(0, 10),
    format: 'knockout',
    formatAuto: true,
    heatSize: 8,
    racesPerHeat: 4,
    race: { kind: 'gp', races: 4, cc: '150' },
    lateSignups: true,
    qualRounds: 3,
    points: DEFAULT_POINTS.slice(),
    entryMode: 'totals',
    trackMode: 'random-cup',
    boosterPass: true,
    finalsFormat: 'auto',
    customStages: [],
    lastChance: false,
    lastChanceWildcards: 2,
    advance: [],
    fill: 'best',
    leagueCups: 3,
    minutesPerRace: 3,
    cupOverheadMinutes: 3,
    changeoverMinutes: 2,
    expectedPlayers: 20,
    availableMinutes: 0,
    startTime: '',
    kioskAutoCheckIn: true,
  };
}

export function createTournament(settings: Settings, id: string, now: number): Tournament {
  return { version: 3, id, settings, players: [], rounds: [], finals: null, suddenDeath: [], createdAt: now, rngCounter: 0 };
}

// ---------------------------------------------------------------- lookups

export const isPlayed = (h: Heat) => !!h.result;
/** All heats of the round are raced, including its Last Chance heat. */
export const roundComplete = (r: Round) => r.heats.every(isPlayed) && (!r.lastChance || isPlayed(r.lastChance));
export const roundHeats = (r: Round): Heat[] => (r.lastChance ? [...r.heats, r.lastChance] : r.heats);
export const currentRound = (t: Tournament): Round | null => t.rounds[t.rounds.length - 1] ?? null;
export const playerById = (t: Tournament, id: string) => t.players.find((p) => p.id === id);

// ---------------------------------------------------------------- controllers

/** Controller number (1..8) of every player in a heat. */
export function seatsOf(h: Heat): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const id of h.playerIds) {
    const s = h.seats?.[id];
    if (s && !taken.has(s)) {
      out.set(id, s);
      taken.add(s);
    }
  }
  // Without stored seats (or for anybody missing one) the list order counts, filling free numbers.
  let next = 1;
  for (const id of h.playerIds) {
    if (out.has(id)) continue;
    while (taken.has(next)) next++;
    out.set(id, next);
    taken.add(next);
  }
  return out;
}

/** Players of a heat in controller order. */
export function bySeat(h: Heat): string[] {
  const seats = seatsOf(h);
  return h.playerIds.slice().sort((a, b) => seats.get(a)! - seats.get(b)!);
}

/** Add a player with the lowest free controller number; everybody else keeps theirs. */
export function seatAdd(h: Heat, id: string): Heat {
  const seats = Object.fromEntries(seatsOf(h));
  const taken = new Set(Object.values(seats));
  let n = 1;
  while (taken.has(n)) n++;
  return { ...h, playerIds: [...h.playerIds, id], seats: { ...seats, [id]: n } };
}

/** Remove players; the others keep their controller numbers. */
export function seatRemove(h: Heat, ids: string[]): Heat {
  const seats = Object.fromEntries(seatsOf(h));
  for (const id of ids) delete seats[id];
  return { ...h, playerIds: h.playerIds.filter((p) => !ids.includes(p)), seats };
}

export function finalsHeats(t: Tournament): Heat[] {
  if (!t.finals) return [];
  return t.finals.stages.flatMap((s) => [...(s.lastChance ? [s.lastChance] : []), ...s.heats]);
}

export function allHeats(t: Tournament): Heat[] {
  return [...t.rounds.flatMap(roundHeats), ...finalsHeats(t)];
}

export type HeatInfo =
  | { kind: 'qual'; roundIndex: number; number: number; of: number; final: boolean; heat: Heat }
  | { kind: 'rlc'; roundIndex: number; heat: Heat }
  | { kind: 'final'; stageIndex: number; stageName: string; number: number; of: number; heat: Heat }
  | { kind: 'lc'; stageIndex: number; stageName: string; heat: Heat };

export function heatInfo(t: Tournament, heatId: string): HeatInfo | null {
  for (const r of t.rounds) {
    const i = r.heats.findIndex((h) => h.id === heatId);
    if (i !== -1) return { kind: 'qual', roundIndex: r.index, number: i + 1, of: r.heats.length, final: !!r.final, heat: r.heats[i] };
    if (r.lastChance?.id === heatId) return { kind: 'rlc', roundIndex: r.index, heat: r.lastChance };
  }
  if (t.finals) {
    for (let s = 0; s < t.finals.stages.length; s++) {
      const stage = t.finals.stages[s];
      if (stage.lastChance?.id === heatId) return { kind: 'lc', stageIndex: s, stageName: stage.config.name, heat: stage.lastChance };
      const i = stage.heats.findIndex((h) => h.id === heatId);
      if (i !== -1) return { kind: 'final', stageIndex: s, stageName: stage.config.name, number: i + 1, of: stage.heats.length, heat: stage.heats[i] };
    }
  }
  return null;
}

/** Table used to score a heat; finals and qualifying share the setup table. */
export function tableFor(t: Tournament): number[] {
  return pointsTable(t.settings);
}

/** The race setup a heat is raced with: its round's, or the settings' for classic finals heats. */
export function raceOf(t: Tournament, heatId: string): RaceSetup {
  const r = t.rounds.find((x) => x.heats.some((h) => h.id === heatId) || x.lastChance?.id === heatId);
  if (r?.race) return r.race;
  if (r) return { kind: t.settings.racesPerHeat === 4 ? 'gp' : 'vs', races: t.settings.racesPerHeat, cc: t.settings.race.cc };
  return t.settings.race;
}

export const racesOf = (t: Tournament, heatId: string) => raceOf(t, heatId).races;

export function scoreOf(t: Tournament, heat: Heat): HeatScore[] | null {
  return scoreHeat(heat, tableFor(t), racesOf(t, heat.id));
}

/** A valid race setup: a Grand Prix always has 4 races, VS 1..32. */
export function normalizeRace(r: RaceSetup): RaceSetup {
  const cc = (['50', '100', '150', '200', 'mirror'] as const).includes(r.cc) ? r.cc : '150';
  if (r.kind === 'gp') return { kind: 'gp', races: 4, cc };
  return { kind: 'vs', races: Math.min(32, Math.max(1, Math.round(r.races) || 4)), cc };
}

export function phaseOf(t: Tournament): Phase {
  const f = t.settings.format;
  if (f === 'knockout') {
    const last = currentRound(t);
    if (!last) return 'registration';
    return last.final && roundComplete(last) ? 'podium' : 'qualifying';
  }
  if (f === 'league') {
    if (!t.rounds.length) return 'registration';
    return t.rounds.length >= t.settings.leagueCups && t.rounds.every(roundComplete) ? 'podium' : 'qualifying';
  }
  if (t.finals) {
    const last = t.finals.stages[t.finals.stages.length - 1];
    return last.heats.length > 0 && last.heats.every(isPlayed) ? 'podium' : 'finals';
  }
  return t.rounds.length ? 'qualifying' : 'registration';
}

/** Heats in play order for the current phase, used for the Now racing / Up next queue. */
export function playQueue(t: Tournament): Heat[] {
  if (t.finals) return finalsHeats(t);
  const r = currentRound(t);
  return r ? roundHeats(r) : [];
}

export function upcoming(t: Tournament): Heat[] {
  return playQueue(t).filter((h) => !isPlayed(h));
}

// ---------------------------------------------------------------- standings

export function scoredQualHeats(t: Tournament, roundFilter?: (r: Round) => boolean): ScoredHeat[] {
  const out: ScoredHeat[] = [];
  for (const r of t.rounds) {
    if (roundFilter && !roundFilter(r)) continue;
    for (const h of r.heats) {
      const scores = scoreOf(t, h);
      if (scores) out.push({ heatId: h.id, scores });
    }
  }
  return out;
}

export function standings(t: Tournament): StandingRow[] {
  return computeStandings(t.players, scoredQualHeats(t), t.settings.qualRounds, t.suddenDeath);
}

/**
 * Standings before the latest round that has results, used for ▲▼ arrows.
 * Returns null when there is nothing to compare against.
 */
export function previousStandings(t: Tournament): StandingRow[] | null {
  const withResults = t.rounds.filter((r) => r.heats.some(isPlayed));
  if (withResults.length < 2) return null;
  const latest = withResults[withResults.length - 1].index;
  return computeStandings(t.players, scoredQualHeats(t, (r) => r.index < latest), t.settings.qualRounds, t.suddenDeath);
}

// ---------------------------------------------------------------- players

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function isNameTaken(t: Tournament, name: string, exceptId?: string): boolean {
  const n = normalizeName(name).toLocaleLowerCase();
  return t.players.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === n);
}

export interface NewPlayer {
  name: string;
  tag?: string;
  /** Missing: the least-used badge colour. */
  color?: string;
  status?: PlayerStatus;
}

export type AddPlayerResult = { ok: true; t: Tournament; player: Player } | { ok: false; error: 'name-required' | 'name-taken' };

export function addPlayer(t: Tournament, input: NewPlayer, id: string, now: number): AddPlayerResult {
  const name = normalizeName(input.name);
  if (!name) return { ok: false, error: 'name-required' };
  if (isNameTaken(t, name)) return { ok: false, error: 'name-taken' };
  const player: Player = {
    id,
    name,
    tag: (input.tag ?? '').trim(),
    color: input.color && COLORS.some((c) => c.toLowerCase() === input.color!.toLowerCase()) ? input.color : pickColor(t.players),
    status: input.status ?? 'registered',
    createdAt: now,
    // Late joiners start with the next generated round.
    joinedRound: t.rounds.length,
  };
  return { ok: true, t: { ...t, players: [...t.players, player] }, player };
}

export function updatePlayer(t: Tournament, id: string, patch: Partial<Omit<Player, 'id'>>): Tournament {
  return { ...t, players: t.players.map((p) => (p.id === id ? { ...p, ...patch, name: patch.name !== undefined ? normalizeName(patch.name) : p.name } : p)) };
}

/** Players that will be put into the next generated round. */
export function roundCandidates(t: Tournament): Player[] {
  return t.players.filter((p) => p.status === 'checked-in' || p.status === 'active');
}

/**
 * Withdraw a player: excluded from every future heat, results stay on record.
 * They are removed from heats that have not been played yet.
 */
export function withdrawPlayer(t: Tournament, id: string, newId: IdGen = () => randomId()): Tournament {
  const strip = (h: Heat): Heat => (isPlayed(h) || !h.playerIds.includes(id) ? h : seatRemove(h, [id]));
  return syncKnockout(
    {
      ...t,
      players: t.players.map((p) => (p.id === id ? { ...p, status: 'withdrawn' } : p)),
      rounds: t.rounds.map((r) => ({ ...r, heats: r.heats.map(strip), ...(r.lastChance ? { lastChance: strip(r.lastChance) } : {}) })),
      finals: t.finals
        ? { ...t.finals, stages: t.finals.stages.map((s) => ({ ...s, heats: s.heats.map(strip), lastChance: s.lastChance ? strip(s.lastChance) : undefined })) }
        : null,
    },
    newId,
  );
}

/**
 * Can someone who signs up now still reach the finals? They need
 * `ceil(rounds/2)` heats: the rounds not generated yet, plus a free slot in the
 * current round if there is one. Returns what they would need and could get.
 */
export function finalsReachForNewPlayer(t: Tournament): { ok: boolean; needed: number; possible: number } {
  if (t.settings.format !== 'classic') {
    // Knockout: only round 1 seats count. League: everyone is ranked by total, late or not.
    const ok = t.settings.format === 'league' || !t.rounds.length || lateJoinSlots(t).length > 0;
    return { ok, needed: 1, possible: ok ? 1 : 0 };
  }
  const needed = minHeatsForFinals(t.settings.qualRounds);
  if (t.finals) return { ok: false, needed, possible: 0 };
  const possible = Math.max(0, t.settings.qualRounds - t.rounds.length) + (lateJoinSlots(t).length ? 1 : 0);
  return { ok: possible >= needed, needed, possible };
}

/** A player can only be deleted while they were never put into a heat; afterwards it is "withdraw". */
export function canDeletePlayer(t: Tournament, id: string): boolean {
  return t.players.some((p) => p.id === id) && !allHeats(t).some((h) => h.playerIds.includes(id));
}

export function deletePlayer(t: Tournament, id: string): Tournament {
  return canDeletePlayer(t, id) ? { ...t, players: t.players.filter((p) => p.id !== id) } : t;
}

/** Un-withdraw: the player rejoins from the next generated round. */
export function reinstatePlayer(t: Tournament, id: string): Tournament {
  return updatePlayer(t, id, { status: 'checked-in', joinedRound: t.rounds.length });
}

/**
 * Unplayed heats that still have room for a late sign-up: the current classic
 * qualifying round, the current league cup, or knockout round 1 (later
 * knockout rounds are earned, so nobody can join them).
 */
export function lateJoinSlots(t: Tournament): Heat[] {
  if (t.finals) return [];
  const r = currentRound(t);
  if (!r) return [];
  if (t.settings.format === 'knockout' && (t.rounds.length > 1 || r.final)) return [];
  return r.heats.filter((h) => !isPlayed(h) && h.playerIds.length < t.settings.heatSize);
}

/** Can someone still sign up and race? */
export function registrationOpen(t: Tournament): boolean {
  if (phaseOf(t) === 'podium') return false;
  if (!t.settings.lateSignups && t.rounds.length > 0) return false;
  if (t.settings.format === 'classic') return !t.finals;
  if (t.settings.format === 'knockout') return !t.rounds.length || lateJoinSlots(t).length > 0;
  // League: while a seat is free in the cups to come.
  return t.players.filter((p) => p.status === 'checked-in' || p.status === 'active').length < t.settings.heatSize;
}

export function addPlayerToHeat(t: Tournament, playerId: string, heatId: string): Tournament {
  const r = currentRound(t);
  if (!r || !lateJoinSlots(t).some((h) => h.id === heatId)) return t;
  return {
    ...t,
    players: t.players.map((p) => (p.id === playerId ? { ...p, status: 'active', joinedRound: r.index } : p)),
    rounds: t.rounds.map((round) =>
      round.id !== r.id ? round : { ...round, heats: round.heats.map((h) => (h.id === heatId ? seatAdd(h, playerId) : h)) },
    ),
  };
}

// ---------------------------------------------------------------- rounds

export type PreviewResult =
  | { ok: true; round: Round; stats: PairingResult; skipped: Player[] }
  | { ok: false; error: 'too-few-players' | 'too-many-players' | 'round-incomplete' | 'all-rounds-played' | 'finals-started' | 'tie'; count?: number; tie?: string[] };

export function canGenerateRound(t: Tournament): PreviewResult | null {
  if (t.finals) return { ok: false, error: 'finals-started' };
  const r = currentRound(t);
  if (r && !roundComplete(r)) return { ok: false, error: 'round-incomplete' };
  const f = t.settings.format;
  if (f === 'classic' && t.rounds.length >= t.settings.qualRounds) return { ok: false, error: 'all-rounds-played' };
  if (f === 'league' && t.rounds.length >= t.settings.leagueCups) return { ok: false, error: 'all-rounds-played' };
  if (f === 'knockout' && r) {
    if (r.final) return { ok: false, error: 'all-rounds-played' };
    const o = roundOutcome(t, r);
    if (o.status === 'tie') return { ok: false, error: 'tie', tie: o.tie };
    if (o.status !== 'done') return { ok: false, error: 'round-incomplete' };
  }
  return null;
}

const noPairingStats = (groups: string[][]): PairingResult => ({ groups, score: 0, repeatScore: 0, repeatedPairs: 0, backToBack: 0, seedConflicts: 0 });

/**
 * Build (but do not save) the next round. Different seeds give different
 * previews where the format draws at random (classic, knockout round 1, the
 * seat order of a league cup); later knockout rounds are seeded.
 */
export function previewRound(t: Tournament, seed: number, newId: IdGen, now: number, race?: RaceSetup): PreviewResult {
  const p = previewRoundInner(t, seed, newId, now);
  return p.ok ? { ...p, round: { ...p.round, race: normalizeRace(race ?? t.settings.race) } } : p;
}

function previewRoundInner(t: Tournament, seed: number, newId: IdGen, now: number): PreviewResult {
  const blocked = canGenerateRound(t);
  if (blocked) return blocked;
  if (t.settings.format === 'knockout') return previewKnockoutRound(t, seed, newId, now);
  if (t.settings.format === 'league') return previewLeagueCup(t, seed, newId, now);
  const candidates = roundCandidates(t);
  const split = splitHeatSizes(candidates.length, t.settings.heatSize);
  if (!split.ok) return { ok: false, error: 'too-few-players', count: candidates.length };

  const rng = createRng(seed);
  const history = buildPairHistory(t.rounds.flatMap((r) => r.heats.map((h) => h.playerIds)));
  const ranked = t.rounds.length ? standings(t).map((s) => s.playerId) : [];
  const prev = currentRound(t);
  const avoidFirst = prev?.heats[prev.heats.length - 1]?.playerIds ?? [];

  let racing = candidates.map((p) => p.id);
  let byes: string[] = [];
  if (split.byes > 0) {
    // Byes go to whoever has played the most heats (random among equals).
    const heatsPlayed = new Map<string, number>();
    for (const r of t.rounds) for (const h of r.heats) for (const p of h.playerIds) heatsPlayed.set(p, (heatsPlayed.get(p) ?? 0) + 1);
    byes = shuffle(racing, rng)
      .sort((a, b) => (heatsPlayed.get(b) ?? 0) - (heatsPlayed.get(a) ?? 0))
      .slice(0, split.byes);
    racing = racing.filter((id) => !byes.includes(id));
  }

  const stats = generatePairing({ players: racing, sizes: split.sizes, history, seedOrder: ranked, avoidFirst, seed: hashString(`${t.id}:${seed}`) });
  const round: Round = {
    id: newId(),
    index: t.rounds.length,
    heats: stats.groups.map((g) => ({ id: newId(), playerIds: g })),
    createdAt: now,
    byes,
  };
  const skipped = t.players.filter((p) => p.status === 'registered');
  return { ok: true, round, stats, skipped };
}

function previewKnockoutRound(t: Tournament, seed: number, newId: IdGen, now: number): PreviewResult {
  const S = t.settings.heatSize;
  const prev = currentRound(t);
  let entrants: string[] | undefined;
  let draw: { groups: string[][]; byes: string[]; final: boolean };
  if (!prev) {
    const ids = roundCandidates(t).map((p) => p.id);
    if (ids.length < 2) return { ok: false, error: 'too-few-players', count: ids.length };
    draw = drawFirstRound(ids, S, hashString(`${t.id}:${seed}`));
  } else {
    const o = roundOutcome(t, prev);
    if (o.status !== 'done') return { ok: false, error: 'round-incomplete' };
    entrants = o.advancing;
    draw = seedRound(entrants, S);
  }
  const index = t.rounds.length;
  const round: Round = {
    id: newId(),
    index,
    heats: draw.groups.map((g) => ({ id: newId(), playerIds: g })),
    createdAt: now,
    byes: draw.byes,
    advance: draw.final ? 0 : advanceFor(t.settings, index),
    fill: t.settings.fill,
    final: draw.final,
    ...(entrants ? { entrants } : {}),
  };
  return { ok: true, round, stats: noPairingStats(draw.groups), skipped: prev ? [] : t.players.filter((p) => p.status === 'registered') };
}

function previewLeagueCup(t: Tournament, seed: number, newId: IdGen, now: number): PreviewResult {
  const ids = roundCandidates(t).map((p) => p.id);
  if (ids.length < 2) return { ok: false, error: 'too-few-players', count: ids.length };
  if (ids.length > t.settings.heatSize) return { ok: false, error: 'too-many-players', count: ids.length };
  const order = shuffle(ids, createRng(hashString(`${t.id}:${seed}`)));
  const round: Round = { id: newId(), index: t.rounds.length, heats: [{ id: newId(), playerIds: order }], createdAt: now, byes: [] };
  return { ok: true, round, stats: noPairingStats([order]), skipped: t.players.filter((p) => p.status === 'registered') };
}

// ---------------------------------------------------------------- knockout

/** Who goes on from a knockout round (see knockout.ts). */
export function roundOutcome(t: Tournament, r: Round): KoOutcome {
  return koOutcome({
    round: r,
    heatSize: t.settings.heatSize,
    scores: r.heats.map((h) => scoreOf(t, h)),
    lastChanceScores: r.lastChance ? scoreOf(t, r.lastChance) : null,
    withdrawn: new Set(t.players.filter((p) => p.status === 'withdrawn').map((p) => p.id)),
    suddenDeath: t.suddenDeath,
    defaultFill: t.settings.fill,
  });
}

const untouched = (r: Round) => !roundHeats(r).some(isPlayed);

/**
 * Keep knockout rounds consistent after a change: create (or rebuild) the Last
 * Chance heat once its pool is known, drop it while it is not needed, and
 * re-seed or drop a later round that nobody has raced yet when an edit
 * changed who advances. Raced heats are never touched.
 */
export function syncKnockout(t: Tournament, newId: IdGen): Tournament {
  if (t.settings.format !== 'knockout' || !t.rounds.length) return t;
  let rounds = t.rounds.slice();
  let changed = false;
  for (let i = 0; i < rounds.length; i++) {
    let r = rounds[i];
    const view = { ...t, rounds };
    if (!r.final) {
      const o = roundOutcome(view, r);
      const lc = r.lastChance;
      if (o.status === 'last-chance') {
        if (!lc || (!isPlayed(lc) && lc.playerIds.join() !== o.pool.join())) {
          r = { ...r, lastChance: { id: newId(), playerIds: o.pool } };
        }
      } else if (lc && !isPlayed(lc) && o.status !== 'done') {
        const { lastChance: _drop, ...rest } = r;
        r = rest;
      }
      if (r !== rounds[i]) {
        rounds[i] = r;
        changed = true;
      }
    }
    const next = rounds[i + 1];
    if (!next || !untouched(next)) continue;
    const o = roundOutcome({ ...t, rounds }, r);
    if (o.status !== 'done' || o.final) {
      rounds = rounds.slice(0, i + 1);
      changed = true;
      break;
    }
    if ((next.entrants ?? []).join() !== o.advancing.join()) {
      const draw = seedRound(o.advancing, t.settings.heatSize);
      rounds[i + 1] = {
        ...next,
        heats: draw.groups.map((g) => ({ id: newId(), playerIds: g })),
        byes: draw.byes,
        final: draw.final,
        advance: draw.final ? 0 : (next.advance ?? advanceFor(t.settings, i + 1)),
        entrants: o.advancing,
        lastChance: undefined,
      };
      rounds = rounds.slice(0, i + 2);
      changed = true;
    }
  }
  return changed ? { ...t, rounds } : t;
}

/** Players who got into a later round as best of the rest or through a Last Chance heat. */
export function luckyLosers(t: Tournament): Set<string> {
  const out = new Set<string>();
  if (t.settings.format !== 'knockout') return out;
  for (const r of t.rounds) {
    const o = roundOutcome(t, r);
    if (o.status === 'done') o.luckyLosers.forEach((id) => out.add(id));
  }
  return out;
}

export interface KoCell {
  place?: number;
  points?: number;
  mark: 'adv' | 'lucky' | 'out' | 'bye' | 'racing' | 'lc';
}

export interface KoRow {
  playerId: string;
  /** Unique 1-based order: still in first, then by the round they went out in. */
  position: number;
  /** Index of the furthest round reached. */
  reached: number;
  status: 'in' | 'out' | 'withdrawn' | 'champion';
  lucky: boolean;
  cells: (KoCell | null)[];
}

/** Live knockout table: everyone who raced, best first. */
export function knockoutTable(t: Tournament): KoRow[] {
  const outcomes = t.rounds.map((r) => roundOutcome(t, r));
  const lucky = luckyLosers(t);
  const withdrawn = new Set(t.players.filter((p) => p.status === 'withdrawn').map((p) => p.id));
  const reached = new Map<string, number>();
  t.rounds.forEach((r, i) => [...roundHeats(r).flatMap((h) => h.playerIds), ...r.byes].forEach((id) => reached.set(id, i)));
  const cellsOf = (id: string): (KoCell | null)[] =>
    t.rounds.map((r, i) => {
      const o = outcomes[i];
      if (r.byes.includes(id)) return { mark: 'bye' };
      const h = r.heats.find((x) => x.playerIds.includes(id));
      const lcScore = r.lastChance?.playerIds.includes(id) ? scoreOf(t, r.lastChance)?.find((x) => x.playerId === id) : undefined;
      if (!h) return null;
      const sc = scoreOf(t, h)?.find((x) => x.playerId === id);
      if (!sc) return { mark: 'racing' };
      let mark: KoCell['mark'] = 'racing';
      if (o.status === 'done') mark = o.final ? 'out' : o.luckyLosers.includes(id) ? 'lucky' : o.advancing.includes(id) ? 'adv' : 'out';
      else if (r.lastChance?.playerIds.includes(id) && !lcScore) mark = 'lc';
      return { place: sc.place, points: sc.points, mark };
    });
  // Order inside a round: the final by place; other rounds by their outcome.
  const orderIn = (i: number, ids: string[]): string[] => {
    const r = t.rounds[i];
    const o = outcomes[i];
    const score = (id: string) => {
      const h = r.heats.find((x) => x.playerIds.includes(id));
      return h ? scoreOf(t, h)?.find((x) => x.playerId === id) : undefined;
    };
    let ref: string[] = [];
    if (o.status === 'done') ref = o.final ? o.out : [...o.advancing, ...o.out];
    const idx = (id: string) => {
      const k = ref.indexOf(id);
      if (k !== -1) return k;
      const sc = score(id);
      return sc ? 1000 + sc.place * 100 - Math.min(99, sc.points / 10) : 5000 + (r.entrants?.indexOf(id) ?? 0);
    };
    return ids.slice().sort((a, b) => Number(withdrawn.has(a)) - Number(withdrawn.has(b)) || idx(a) - idx(b));
  };
  const rows: KoRow[] = [];
  const last = t.rounds.length - 1;
  for (let i = last; i >= 0; i--) {
    const ids = [...reached.entries()].filter(([, v]) => v === i).map(([id]) => id);
    for (const id of orderIn(i, ids)) {
      const o = outcomes[i];
      let status: KoRow['status'] = 'in';
      if (withdrawn.has(id)) status = 'withdrawn';
      else if (o.status === 'done' && o.final) status = o.out[0] === id ? 'champion' : 'out';
      else if (i < last || (o.status === 'done' && !o.advancing.includes(id))) status = 'out';
      rows.push({ playerId: id, position: rows.length + 1, reached: i, status, lucky: lucky.has(id), cells: cellsOf(id) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- league

export function leagueTable(t: Tournament): LeagueRow[] {
  const cups = Array.from({ length: Math.max(t.settings.leagueCups, t.rounds.length) }, (_, i) => {
    const h = t.rounds[i]?.heats[0];
    return h ? scoreOf(t, h) : null;
  });
  return leagueStandings(t.players, cups, t.suddenDeath);
}

/** A tie for a podium place after the last cup that sudden death must decide. */
export function leagueTie(t: Tournament): string[] | null {
  if (t.settings.format !== 'league' || phaseOf(t) !== 'podium') return null;
  return leaguePodiumTie(leagueTable(t));
}

export function commitRound(t: Tournament, round: Round): Tournament {
  const inRound = new Set([...round.heats.flatMap((h) => h.playerIds), ...round.byes]);
  return {
    ...t,
    // The next round starts from this round's race setup.
    settings: round.race ? { ...t.settings, race: round.race } : t.settings,
    rngCounter: t.rngCounter + 1,
    players: t.players.map((p) => (inRound.has(p.id) && p.status === 'checked-in' ? { ...p, status: 'active' } : p)),
    rounds: [...t.rounds, round],
  };
}

/** Change how an unraced round is raced. */
export function setRoundRace(t: Tournament, roundId: string, race: RaceSetup): Tournament {
  const r = t.rounds.find((x) => x.id === roundId);
  if (!r || roundHeats(r).some(isPlayed)) return t;
  const norm = normalizeRace(race);
  return { ...t, settings: r.index === t.rounds.length - 1 ? { ...t.settings, race: norm } : t.settings, rounds: t.rounds.map((x) => (x.id === roundId ? { ...x, race: norm } : x)) };
}

function mapHeat(t: Tournament, heatId: string, fn: (h: Heat) => Heat): Tournament {
  const f = (h: Heat) => (h.id === heatId ? fn(h) : h);
  return {
    ...t,
    rounds: t.rounds.map((r) =>
      r.heats.some((h) => h.id === heatId) ? { ...r, heats: r.heats.map(f) } : r.lastChance?.id === heatId ? { ...r, lastChance: f(r.lastChance) } : r,
    ),
    finals: t.finals
      ? { ...t.finals, stages: t.finals.stages.map((s) => ({ ...s, heats: s.heats.map(f), lastChance: s.lastChance ? f(s.lastChance) : undefined })) }
      : null,
  };
}

export function saveHeatResult(t: Tournament, heatId: string, result: HeatResult, now: number, newId: IdGen): Tournament {
  const next = mapHeat(t, heatId, (h) => ({ ...h, result, savedAt: now, finishedAt: h.finishedAt ?? now }));
  return syncKnockout(syncFinals(next, newId), newId);
}

/**
 * Delete a heat's result: the heat goes back into the queue and will be raced
 * again, so players who withdrew since are taken out of it.
 */
export function clearHeatResult(t: Tournament, heatId: string, newId: IdGen): Tournament {
  const withdrawn = new Set(t.players.filter((p) => p.status === 'withdrawn').map((p) => p.id));
  const next = mapHeat(t, heatId, (h) => {
    const gone = h.playerIds.filter((id) => withdrawn.has(id));
    return { ...(gone.length ? seatRemove(h, gone) : h), result: undefined, savedAt: undefined, finishedAt: undefined };
  });
  return syncKnockout(syncFinals(next, newId), newId);
}

export function setHeatCup(t: Tournament, heatId: string, cup: CupPick | undefined): Tournament {
  return mapHeat(t, heatId, (h) => ({ ...h, cup }));
}

/**
 * Random cup/track pick that avoids repeats until the whole pool has been used.
 * A Grand Prix gets a cup (or 4 tracks); VS races get as many tracks as races.
 */
export function randomCupFor(t: Tournament, seed: number, heatId?: string): CupPick | undefined {
  const rng = createRng(seed);
  const cups = cupPool(CUPS, t.settings.boosterPass);
  const used = usedFromHeats(allHeats(t));
  const race = heatId ? raceOf(t, heatId) : t.settings.race;
  if (t.settings.trackMode === 'none' || t.settings.trackMode === 'pick') return undefined;
  if (race.kind === 'vs') return pickRandomTracks(trackPool(cups), used.tracks, race.races, rng);
  if (t.settings.trackMode === 'random-cup') return pickRandomCup(cups, used.cups, rng);
  return pickRandomTracks(trackPool(cups), used.tracks, 4, rng);
}

/** Swap the play order of two unplayed heats in the current queue. */
export function swapHeats(t: Tournament, a: string, b: string): Tournament {
  const swapIn = (heats: Heat[]): Heat[] => {
    const i = heats.findIndex((h) => h.id === a);
    const j = heats.findIndex((h) => h.id === b);
    if (i === -1 || j === -1 || isPlayed(heats[i]) || isPlayed(heats[j])) return heats;
    const copy = heats.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };
  return {
    ...t,
    rounds: t.rounds.map((r) => ({ ...r, heats: swapIn(r.heats) })),
    finals: t.finals ? { ...t.finals, stages: t.finals.stages.map((s) => ({ ...s, heats: swapIn(s.heats) })) } : null,
  };
}

/**
 * Moving a player between two unplayed heats of the same qualifying round is
 * allowed when every heat stays within 3..max and sizes don't spread further apart.
 */
export function canMovePlayer(t: Tournament, playerId: string, toHeatId: string): boolean {
  const r = t.rounds.find((round) => round.heats.some((h) => h.id === toHeatId));
  if (!r) return false;
  const from = r.heats.find((h) => h.playerIds.includes(playerId));
  const to = r.heats.find((h) => h.id === toHeatId)!;
  if (!from || from.id === to.id || isPlayed(from) || isPlayed(to)) return false;
  const before = r.heats.map((h) => h.playerIds.length);
  const after = r.heats.map((h) => h.playerIds.length + (h.id === to.id ? 1 : 0) - (h.id === from.id ? 1 : 0));
  const spread = Math.max(1, Math.max(...before) - Math.min(...before));
  return sizesAreValid(after, t.settings.heatSize, spread, t.settings.format === 'classic' ? MIN_HEAT_SIZE : 2);
}

export function movePlayer(t: Tournament, playerId: string, toHeatId: string): Tournament {
  if (!canMovePlayer(t, playerId, toHeatId)) return t;
  return {
    ...t,
    rounds: t.rounds.map((r) =>
      !r.heats.some((h) => h.id === toHeatId)
        ? r
        : {
            ...r,
            heats: r.heats.map((h) => {
              if (h.id === toHeatId) return seatAdd(h, playerId);
              if (h.playerIds.includes(playerId)) return seatRemove(h, [playerId]);
              return h;
            }),
          },
    ),
  };
}

export function setQualRounds(t: Tournament, n: number): Tournament {
  return { ...t, settings: { ...t.settings, qualRounds: Math.max(n, t.rounds.length, 1) } };
}

export function setLeagueCups(t: Tournament, n: number): Tournament {
  return { ...t, settings: { ...t.settings, leagueCups: Math.max(n, t.rounds.length, 1) } };
}

// ---------------------------------------------------------------- finals

export interface FinalsPlan {
  stages: StageConfig[] | null;
  errors: StageError[];
  eligible: StandingRow[];
  /** Tied group straddling a cut line that needs a sudden-death decision. */
  tie: string[] | null;
}

export function finalsPlan(t: Tournament, stagesOverride?: StageConfig[]): FinalsPlan {
  const eligible = standings(t).filter((r) => r.eligible);
  const s = t.settings;
  const stages =
    stagesOverride ??
    (s.finalsFormat === 'custom' && s.customStages.length
      ? s.customStages
      : presetStages(s.heatSize, eligible.length, s.lastChance, s.lastChanceWildcards));
  if (!stages) return { stages: null, errors: [{ code: 'not-enough-players', stage: 0, needed: MIN_HEAT_SIZE, available: eligible.length }], eligible, tie: null };
  const errors = validateStages(stages, { heatSize: s.heatSize, eligible: eligible.length });
  let tie: string[] | null = null;
  if (!errors.length) {
    const direct = stages[0].fieldSize - stages[0].wildcards;
    tie = tieAcrossCut(eligible, direct);
    if (!tie && stages[0].wildcards > 0) {
      const lcSize = Math.min(eligible.length - direct, s.heatSize);
      tie = tieAcrossCut(eligible, direct + lcSize);
    }
  }
  return { stages, errors, eligible, tie };
}

export function resolveSuddenDeath(t: Tournament, entry: SuddenDeath, newId: IdGen = () => randomId()): Tournament {
  return syncKnockout({ ...t, suddenDeath: [...t.suddenDeath.filter((s) => s.key !== entry.key), entry] }, newId);
}

export function startFinals(t: Tournament, stages: StageConfig[], newId: IdGen, now: number): Tournament {
  const plan = finalsPlan(t, stages);
  if (plan.errors.length || plan.tie || !plan.stages) return t;
  const order = plan.eligible.map((r) => r.playerId);
  const first = stages[0];
  const direct = order.slice(0, first.fieldSize - first.wildcards);
  const stage0: FinalsStage = { config: first, seeds: direct, heats: [] };
  if (first.wildcards > 0) {
    const pool = order.slice(direct.length, direct.length + t.settings.heatSize);
    stage0.lastChance = { id: newId(), playerIds: pool };
  }
  const finals = {
    stages: [stage0, ...stages.slice(1).map((config) => ({ config, seeds: [], heats: [] }))],
    qualifyingOrder: standings(t).map((r) => r.playerId),
    startedAt: now,
  };
  return syncFinals({ ...t, finals }, newId);
}

export function cancelFinals(t: Tournament): Tournament {
  return { ...t, finals: null };
}

const stageScores = (t: Tournament, stage: FinalsStage): HeatScore[][] | null => {
  if (!stage.heats.length || !stage.heats.every(isPlayed)) return null;
  return stage.heats.map((h) => scoreOf(t, h)!);
};

/**
 * Bring the finals up to date after results change: create Last Chance heats
 * and the next stage's heats as soon as their entrants are known, and re-seed
 * a later stage if an earlier result was edited before that stage was raced.
 */
export function syncFinals(t: Tournament, newId: IdGen): Tournament {
  if (!t.finals) return t;
  const stages = t.finals.stages.map((s) => ({ ...s }));
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const untouched = !stage.heats.some(isPlayed) && !(stage.lastChance && isPlayed(stage.lastChance));
    // Who enters this stage directly?
    let direct: string[] | null;
    if (i === 0) direct = stage.config.wildcards > 0 ? stage.seeds.slice(0, stage.config.fieldSize - stage.config.wildcards) : stage.seeds;
    else {
      const prevScores = stageScores(t, stages[i - 1]);
      direct = prevScores ? splitStageOutcome(stages[i - 1], prevScores).advancing : null;
    }
    if (!direct) {
      if (untouched) stages[i] = { ...stage, seeds: [], heats: [], lastChance: undefined };
      continue;
    }
    // Last Chance heat for wildcard spots.
    let wild: string[] = [];
    if (stage.config.wildcards > 0) {
      if (i > 0 && untouched) {
        const prevScores = stageScores(t, stages[i - 1])!;
        const pool = splitStageOutcome(stages[i - 1], prevScores).eliminated.slice(0, t.settings.heatSize);
        if (!stage.lastChance || stage.lastChance.playerIds.join() !== pool.join()) stages[i].lastChance = { id: newId(), playerIds: pool };
      }
      const lc = stages[i].lastChance;
      const lcScores = lc ? scoreOf(t, lc) : null;
      if (!lcScores) {
        if (untouched || !stage.heats.length) stages[i] = { ...stages[i], seeds: i === 0 ? stage.seeds : direct, heats: [] };
        continue;
      }
      wild = lastChanceWinners(lcScores, stage.config.wildcards);
    }
    const seeds = [...direct, ...wild];
    if (!stage.heats.some(isPlayed)) {
      const same = stage.heats.length && stage.seeds.join() === seeds.join();
      if (!same) {
        const groups = snakeSeed(seeds, heatCountOf(stage.config));
        stages[i] = { ...stages[i], seeds, heats: groups.map((g) => ({ id: newId(), playerIds: g })) };
      }
    }
  }
  return { ...t, finals: { ...t.finals, stages } };
}

export function finalResults(t: Tournament): FinalRow[] | null {
  if (phaseOf(t) !== 'podium') return null;
  if (t.settings.format === 'knockout') return knockoutTable(t).map((r) => ({ playerId: r.playerId, place: r.position, stageReached: r.reached }));
  if (t.settings.format === 'league') {
    if (leagueTie(t)) return null;
    return leagueTable(t)
      .filter((r) => r.cups > 0)
      .map((r, i) => ({ playerId: r.playerId, place: i + 1, stageReached: -1 }));
  }
  if (!t.finals) return null;
  const scored = t.finals.stages.map((s) => stageScores(t, s));
  const lc = t.finals.stages.map((s) => (s.lastChance ? scoreOf(t, s.lastChance) : null));
  return finalStandings(t.finals.stages, scored, lc, t.finals.qualifyingOrder);
}

export { eliminatedCount };
