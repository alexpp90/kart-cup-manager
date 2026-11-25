// Pure state transitions on a Tournament. Every function returns a new object
// and never mutates its input, so the store can snapshot freely for undo.
import { CUPS } from '../data/cups';
import { cupPool, pickRandomCup, pickRandomTracks, trackPool, usedFromHeats } from './cups';
import { eliminatedCount, heatCountOf, lastChanceWinners, presetStages, snakeSeed, splitStageOutcome, validateStages, finalStandings, type FinalRow, type StageError } from './finals';
import { MIN_HEAT_SIZE, sizesAreValid, splitHeatSizes } from './heats';
import { buildPairHistory, generatePairing, type PairingResult } from './pairing';
import { DEFAULT_POINTS_4, DEFAULT_POINTS_8, pointsTable, scoreHeat } from './points';
import { computeStandings, minHeatsForFinals, tieAcrossCut, type ScoredHeat, type StandingRow } from './ranking';
import { createRng, hashString, shuffle } from './rng';
import type { CupPick, FinalsStage, Heat, HeatResult, HeatScore, Phase, Player, PlayerStatus, Round, Settings, StageConfig, SuddenDeath, Tournament } from './types';

export type IdGen = () => string;

export function defaultSettings(): Settings {
  return {
    name: 'Kart Cup',
    date: new Date().toISOString().slice(0, 10),
    maxPerHeat: 8,
    racesPerHeat: 4,
    qualRounds: 3,
    points8: DEFAULT_POINTS_8.slice(),
    points4: DEFAULT_POINTS_4.slice(),
    entryMode: 'per-race',
    trackMode: 'random-cup',
    boosterPass: true,
    finalsFormat: 'auto',
    customStages: [],
    lastChance: false,
    lastChanceWildcards: 2,
    minutesPerRace: 2.5,
    changeoverMinutes: 2,
    expectedPlayers: 30,
    kioskAutoCheckIn: true,
  };
}

export function createTournament(settings: Settings, id: string, now: number): Tournament {
  return { version: 1, id, settings, players: [], rounds: [], finals: null, suddenDeath: [], createdAt: now, rngCounter: 0 };
}

// ---------------------------------------------------------------- lookups

export const isPlayed = (h: Heat) => !!h.result;
export const roundComplete = (r: Round) => r.heats.every(isPlayed);
export const currentRound = (t: Tournament): Round | null => t.rounds[t.rounds.length - 1] ?? null;
export const playerById = (t: Tournament, id: string) => t.players.find((p) => p.id === id);

export function finalsHeats(t: Tournament): Heat[] {
  if (!t.finals) return [];
  return t.finals.stages.flatMap((s) => [...(s.lastChance ? [s.lastChance] : []), ...s.heats]);
}

export function allHeats(t: Tournament): Heat[] {
  return [...t.rounds.flatMap((r) => r.heats), ...finalsHeats(t)];
}

export type HeatInfo =
  | { kind: 'qual'; roundIndex: number; number: number; heat: Heat }
  | { kind: 'final'; stageIndex: number; stageName: string; number: number; of: number; heat: Heat }
  | { kind: 'lc'; stageIndex: number; stageName: string; heat: Heat };

export function heatInfo(t: Tournament, heatId: string): HeatInfo | null {
  for (const r of t.rounds) {
    const i = r.heats.findIndex((h) => h.id === heatId);
    if (i !== -1) return { kind: 'qual', roundIndex: r.index, number: i + 1, heat: r.heats[i] };
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

export function scoreOf(t: Tournament, heat: Heat): HeatScore[] | null {
  return scoreHeat(heat, tableFor(t));
}

export function phaseOf(t: Tournament): Phase {
  if (t.finals) {
    const last = t.finals.stages[t.finals.stages.length - 1];
    return last.heats.length > 0 && last.heats.every(isPlayed) ? 'podium' : 'finals';
  }
  return t.rounds.length ? 'qualifying' : 'registration';
}

/** Heats in play order for the current phase, used for the Now racing / Up next queue. */
export function playQueue(t: Tournament): Heat[] {
  if (t.finals) return finalsHeats(t);
  return currentRound(t)?.heats ?? [];
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
  avatar: string;
  color: string;
  favorite?: string;
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
    avatar: input.avatar,
    color: input.color,
    favorite: (input.favorite ?? '').trim(),
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
export function withdrawPlayer(t: Tournament, id: string): Tournament {
  const strip = (h: Heat): Heat => (isPlayed(h) ? h : { ...h, playerIds: h.playerIds.filter((p) => p !== id) });
  return {
    ...t,
    players: t.players.map((p) => (p.id === id ? { ...p, status: 'withdrawn' } : p)),
    rounds: t.rounds.map((r) => ({ ...r, heats: r.heats.map(strip) })),
    finals: t.finals
      ? { ...t.finals, stages: t.finals.stages.map((s) => ({ ...s, heats: s.heats.map(strip), lastChance: s.lastChance ? strip(s.lastChance) : undefined })) }
      : null,
  };
}

/**
 * Can someone who signs up now still reach the finals? They need
 * `ceil(rounds/2)` heats: the rounds not generated yet, plus a free slot in the
 * current round if there is one. Returns what they would need and could get.
 */
export function finalsReachForNewPlayer(t: Tournament): { ok: boolean; needed: number; possible: number } {
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

/** Unplayed heats of the current qualifying round that still have room (late registration). */
export function lateJoinSlots(t: Tournament): Heat[] {
  if (t.finals) return [];
  const r = currentRound(t);
  if (!r) return [];
  return r.heats.filter((h) => !isPlayed(h) && h.playerIds.length < t.settings.maxPerHeat);
}

export function addPlayerToHeat(t: Tournament, playerId: string, heatId: string): Tournament {
  const r = currentRound(t);
  if (!r || !lateJoinSlots(t).some((h) => h.id === heatId)) return t;
  return {
    ...t,
    players: t.players.map((p) => (p.id === playerId ? { ...p, status: 'active', joinedRound: r.index } : p)),
    rounds: t.rounds.map((round) =>
      round.id !== r.id ? round : { ...round, heats: round.heats.map((h) => (h.id === heatId ? { ...h, playerIds: [...h.playerIds, playerId] } : h)) },
    ),
  };
}

// ---------------------------------------------------------------- rounds

export type PreviewResult =
  | { ok: true; round: Round; stats: PairingResult; skipped: Player[] }
  | { ok: false; error: 'too-few-players' | 'round-incomplete' | 'all-rounds-played' | 'finals-started'; count?: number };

export function canGenerateRound(t: Tournament): PreviewResult | null {
  if (t.finals) return { ok: false, error: 'finals-started' };
  const r = currentRound(t);
  if (r && !roundComplete(r)) return { ok: false, error: 'round-incomplete' };
  if (t.rounds.length >= t.settings.qualRounds) return { ok: false, error: 'all-rounds-played' };
  return null;
}

/** Build (but do not save) the next qualifying round. Different seeds give different previews. */
export function previewRound(t: Tournament, seed: number, newId: IdGen, now: number): PreviewResult {
  const blocked = canGenerateRound(t);
  if (blocked) return blocked;
  const candidates = roundCandidates(t);
  const split = splitHeatSizes(candidates.length, t.settings.maxPerHeat);
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

export function commitRound(t: Tournament, round: Round): Tournament {
  const inRound = new Set(round.heats.flatMap((h) => h.playerIds));
  return {
    ...t,
    rngCounter: t.rngCounter + 1,
    players: t.players.map((p) => (inRound.has(p.id) && p.status === 'checked-in' ? { ...p, status: 'active' } : p)),
    rounds: [...t.rounds, round],
  };
}

function mapHeat(t: Tournament, heatId: string, fn: (h: Heat) => Heat): Tournament {
  const f = (h: Heat) => (h.id === heatId ? fn(h) : h);
  return {
    ...t,
    rounds: t.rounds.map((r) => (r.heats.some((h) => h.id === heatId) ? { ...r, heats: r.heats.map(f) } : r)),
    finals: t.finals
      ? { ...t.finals, stages: t.finals.stages.map((s) => ({ ...s, heats: s.heats.map(f), lastChance: s.lastChance ? f(s.lastChance) : undefined })) }
      : null,
  };
}

export function saveHeatResult(t: Tournament, heatId: string, result: HeatResult, now: number, newId: IdGen): Tournament {
  const next = mapHeat(t, heatId, (h) => ({ ...h, result, savedAt: now }));
  return syncFinals(next, newId);
}

/**
 * Delete a heat's result: the heat goes back into the queue and will be raced
 * again, so players who withdrew since are taken out of it.
 */
export function clearHeatResult(t: Tournament, heatId: string, newId: IdGen): Tournament {
  const withdrawn = new Set(t.players.filter((p) => p.status === 'withdrawn').map((p) => p.id));
  const next = mapHeat(t, heatId, (h) => ({ ...h, playerIds: h.playerIds.filter((id) => !withdrawn.has(id)), result: undefined, savedAt: undefined }));
  return syncFinals(next, newId);
}

export function setHeatCup(t: Tournament, heatId: string, cup: CupPick | undefined): Tournament {
  return mapHeat(t, heatId, (h) => ({ ...h, cup }));
}

/** Random cup/track pick that avoids repeats until the whole pool has been used. */
export function randomCupFor(t: Tournament, seed: number): CupPick | undefined {
  const rng = createRng(seed);
  const cups = cupPool(CUPS, t.settings.boosterPass);
  const used = usedFromHeats(allHeats(t));
  if (t.settings.trackMode === 'random-cup') return pickRandomCup(cups, used.cups, rng);
  if (t.settings.trackMode === 'random-tracks') return pickRandomTracks(trackPool(cups), used.tracks, t.settings.racesPerHeat, rng);
  return undefined;
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
  return sizesAreValid(after, t.settings.maxPerHeat, spread);
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
              if (h.id === toHeatId) return { ...h, playerIds: [...h.playerIds, playerId] };
              if (h.playerIds.includes(playerId)) return { ...h, playerIds: h.playerIds.filter((p) => p !== playerId) };
              return h;
            }),
          },
    ),
  };
}

export function setQualRounds(t: Tournament, n: number): Tournament {
  return { ...t, settings: { ...t.settings, qualRounds: Math.max(n, t.rounds.length, 1) } };
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
      : presetStages(s.maxPerHeat, eligible.length, s.lastChance, s.lastChanceWildcards));
  if (!stages) return { stages: null, errors: [{ code: 'not-enough-players', stage: 0, needed: MIN_HEAT_SIZE, available: eligible.length }], eligible, tie: null };
  const errors = validateStages(stages, { maxPerHeat: s.maxPerHeat, eligible: eligible.length });
  let tie: string[] | null = null;
  if (!errors.length) {
    const direct = stages[0].fieldSize - stages[0].wildcards;
    tie = tieAcrossCut(eligible, direct);
    if (!tie && stages[0].wildcards > 0) {
      const lcSize = Math.min(eligible.length - direct, s.maxPerHeat);
      tie = tieAcrossCut(eligible, direct + lcSize);
    }
  }
  return { stages, errors, eligible, tie };
}

export function resolveSuddenDeath(t: Tournament, entry: SuddenDeath): Tournament {
  return { ...t, suddenDeath: [...t.suddenDeath.filter((s) => s.key !== entry.key), entry] };
}

export function startFinals(t: Tournament, stages: StageConfig[], newId: IdGen, now: number): Tournament {
  const plan = finalsPlan(t, stages);
  if (plan.errors.length || plan.tie || !plan.stages) return t;
  const order = plan.eligible.map((r) => r.playerId);
  const first = stages[0];
  const direct = order.slice(0, first.fieldSize - first.wildcards);
  const stage0: FinalsStage = { config: first, seeds: direct, heats: [] };
  if (first.wildcards > 0) {
    const pool = order.slice(direct.length, direct.length + t.settings.maxPerHeat);
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
        const pool = splitStageOutcome(stages[i - 1], prevScores).eliminated.slice(0, t.settings.maxPerHeat);
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
  if (!t.finals || phaseOf(t) !== 'podium') return null;
  const scored = t.finals.stages.map((s) => stageScores(t, s));
  const lc = t.finals.stages.map((s) => (s.lastChance ? scoreOf(t, s.lastChance) : null));
  return finalStandings(t.finals.stages, scored, lc, t.finals.qualifyingOrder);
}

export { eliminatedCount };
