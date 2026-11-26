// Every change to a tournament is a command: plain JSON, validated and applied
// by one pure function. Offline the store applies it locally (with snapshot
// undo); a server can apply exactly the same function to its log later.
import {
  addPlayer,
  addPlayerToHeat,
  cancelFinals,
  clearHeatResult,
  commitRound,
  deletePlayer,
  heatInfo,
  isNameTaken,
  movePlayer,
  normalizeName,
  previewRound,
  racesOf,
  setRoundRace,
  reinstatePlayer,
  resolveSuddenDeath,
  saveHeatResult,
  setHeatCup,
  setLeagueCups,
  setQualRounds,
  startFinals,
  swapHeats,
  updatePlayer,
  withdrawPlayer,
  type IdGen,
  type NewPlayer,
} from './tournament';
import { COLORS } from '../data/colors';
import { validateResult } from './points';
import type { CupPick, HeatResult, Player, RaceSetup, Settings, StageConfig, SuddenDeath, Tournament } from './types';

export type Command =
  | { type: 'addPlayer'; player: NewPlayer }
  | { type: 'addPlayers'; players: NewPlayer[] }
  | { type: 'updatePlayer'; id: string; patch: Partial<Pick<Player, 'name' | 'tag' | 'color'>> }
  | { type: 'setCheckedIn'; id: string; on: boolean }
  | { type: 'withdraw'; id: string }
  | { type: 'reinstate'; id: string }
  | { type: 'deletePlayer'; id: string }
  | { type: 'lateJoin'; playerId: string; heatId: string }
  | { type: 'updateSettings'; settings: Settings }
  | { type: 'addRound' }
  | { type: 'generateRound'; seed: number; race?: RaceSetup }
  | { type: 'setRoundRace'; roundId: string; race: RaceSetup }
  | { type: 'movePlayer'; playerId: string; heatId: string }
  | { type: 'swapHeats'; a: string; b: string }
  | { type: 'setCup'; heatId: string; cup?: CupPick }
  | { type: 'saveResult'; heatId: string; result: HeatResult }
  | { type: 'clearResult'; heatId: string }
  | { type: 'resolveSuddenDeath'; entry: SuddenDeath }
  | { type: 'startFinals'; stages: StageConfig[] }
  | { type: 'cancelFinals' };

export interface CommandContext {
  now: number;
  newId: IdGen;
}

export type CommandResult =
  | { ok: true; t: Tournament; playerId?: string; added?: number; skipped?: string[] }
  | { ok: false; error: string };

const fail = (error: string): CommandResult => ({ ok: false, error });
const ok = (t: Tournament): CommandResult => ({ ok: true, t });

/** Settings that can't change once the first round exists. */
const LOCKED_AFTER_START: (keyof Settings)[] = ['format', 'heatSize'];

export function applyCommand(t: Tournament, cmd: Command, ctx: CommandContext): CommandResult {
  const player = (id: string) => t.players.find((p) => p.id === id);
  switch (cmd.type) {
    case 'addPlayer': {
      const id = ctx.newId();
      const r = addPlayer(t, cmd.player, id, ctx.now);
      return r.ok ? { ok: true, t: r.t, playerId: r.player.id } : fail(r.error);
    }
    case 'addPlayers': {
      let cur = t;
      let added = 0;
      const skipped: string[] = [];
      for (const p of cmd.players) {
        const r = addPlayer(cur, p, ctx.newId(), ctx.now);
        if (r.ok) {
          cur = r.t;
          added++;
        } else if (normalizeName(p.name)) skipped.push(normalizeName(p.name));
      }
      return { ok: true, t: cur, added, skipped };
    }
    case 'updatePlayer': {
      if (!player(cmd.id)) return fail('unknown-player');
      if (cmd.patch.color !== undefined && !COLORS.includes(cmd.patch.color)) return fail('bad-color');
      if (cmd.patch.name !== undefined) {
        if (!normalizeName(cmd.patch.name)) return fail('name-required');
        if (isNameTaken(t, cmd.patch.name, cmd.id)) return fail('name-taken');
      }
      return ok(updatePlayer(t, cmd.id, cmd.patch));
    }
    case 'setCheckedIn': {
      const p = player(cmd.id);
      if (!p || p.status === 'withdrawn' || p.status === 'active') return fail('not-allowed');
      return ok(updatePlayer(t, cmd.id, { status: cmd.on ? 'checked-in' : 'registered', joinedRound: t.rounds.length }));
    }
    case 'withdraw':
      return player(cmd.id) ? ok(withdrawPlayer(t, cmd.id, ctx.newId)) : fail('unknown-player');
    case 'reinstate':
      return player(cmd.id)?.status === 'withdrawn' ? ok(reinstatePlayer(t, cmd.id)) : fail('not-allowed');
    case 'deletePlayer': {
      const next = deletePlayer(t, cmd.id);
      return next === t ? fail('not-allowed') : ok(next);
    }
    case 'lateJoin': {
      const next = addPlayerToHeat(t, cmd.playerId, cmd.heatId);
      return next === t ? fail('not-allowed') : ok(next);
    }
    case 'updateSettings': {
      const s = { ...cmd.settings };
      const started = t.rounds.length > 0;
      if (started) for (const k of LOCKED_AFTER_START) (s as Record<string, unknown>)[k] = t.settings[k];
      s.name = s.name.trim() || t.settings.name;
      s.qualRounds = Math.max(s.qualRounds, t.rounds.length, 1);
      s.leagueCups = Math.max(s.leagueCups, t.rounds.length, 1);
      return ok({ ...t, settings: s });
    }
    case 'addRound':
      return ok(t.settings.format === 'league' ? setLeagueCups(t, t.settings.leagueCups + 1) : setQualRounds(t, t.settings.qualRounds + 1));
    case 'generateRound': {
      const p = previewRound(t, cmd.seed, ctx.newId, ctx.now, cmd.race);
      return p.ok ? ok(commitRound(t, p.round)) : fail(p.error);
    }
    case 'setRoundRace': {
      const next = setRoundRace(t, cmd.roundId, cmd.race);
      return next === t ? fail('not-allowed') : ok(next);
    }
    case 'movePlayer': {
      const next = movePlayer(t, cmd.playerId, cmd.heatId);
      return next === t ? fail('not-allowed') : ok(next);
    }
    case 'swapHeats':
      return ok(swapHeats(t, cmd.a, cmd.b));
    case 'setCup':
      return heatInfo(t, cmd.heatId) ? ok(setHeatCup(t, cmd.heatId, cmd.cup)) : fail('unknown-heat');
    case 'saveResult': {
      const info = heatInfo(t, cmd.heatId);
      if (!info) return fail('unknown-heat');
      const races = racesOf(t, cmd.heatId);
      if (validateResult(cmd.result, info.heat.playerIds, races).length) return fail('invalid-result');
      if (cmd.result.mode === 'per-race' && cmd.result.races.length !== races) return fail('invalid-result');
      return ok(saveHeatResult(t, cmd.heatId, cmd.result, ctx.now, ctx.newId));
    }
    case 'clearResult':
      return heatInfo(t, cmd.heatId) ? ok(clearHeatResult(t, cmd.heatId, ctx.newId)) : fail('unknown-heat');
    case 'resolveSuddenDeath':
      return ok(resolveSuddenDeath(t, cmd.entry, ctx.newId));
    case 'startFinals': {
      const next = startFinals(t, cmd.stages, ctx.newId, ctx.now);
      return next === t ? fail('not-allowed') : ok(next);
    }
    case 'cancelFinals':
      return ok(cancelFinals(t));
  }
}

/** Undo label of a command as an i18n key with parameters. */
export function commandLabel(t: Tournament, cmd: Command): { key: string; params?: Record<string, string | number> } {
  const name = (id: string) => t.players.find((p) => p.id === id)?.name ?? '?';
  switch (cmd.type) {
    case 'addPlayer':
      return { key: 'action.addPlayer', params: { name: normalizeName(cmd.player.name) } };
    case 'addPlayers':
      return { key: 'action.quickAdd' };
    case 'updatePlayer':
      return { key: 'action.editPlayer', params: { name: cmd.patch.name ? normalizeName(cmd.patch.name) : name(cmd.id) } };
    case 'setCheckedIn':
      return { key: 'action.checkIn', params: { name: name(cmd.id) } };
    case 'withdraw':
      return { key: 'action.withdraw', params: { name: name(cmd.id) } };
    case 'reinstate':
      return { key: 'action.reinstate', params: { name: name(cmd.id) } };
    case 'deletePlayer':
      return { key: 'action.deletePlayer', params: { name: name(cmd.id) } };
    case 'lateJoin':
      return { key: 'action.lateJoin', params: { name: name(cmd.playerId) } };
    case 'updateSettings':
      return { key: 'action.settings' };
    case 'addRound':
      return { key: t.settings.format === 'league' ? 'action.extraCup' : 'action.extraRound' };
    case 'generateRound':
      return { key: t.settings.format === 'league' ? 'action.cupCreated' : 'action.round', params: { n: t.rounds.length + 1 } };
    case 'setRoundRace':
      return { key: 'action.raceSetup' };
    case 'movePlayer':
      return { key: 'action.move', params: { name: name(cmd.playerId) } };
    case 'swapHeats':
      return { key: 'action.swap' };
    case 'setCup':
      return { key: 'action.cup' };
    case 'saveResult':
      return { key: 'action.saveHeat' };
    case 'clearResult':
      return { key: 'action.clearHeat' };
    case 'resolveSuddenDeath':
      return { key: 'action.sudden' };
    case 'startFinals':
      return { key: 'action.finals' };
    case 'cancelFinals':
      return { key: 'action.cancelFinals' };
  }
}
