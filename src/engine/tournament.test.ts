import { describe, expect, it } from 'vitest';
import { LEGACY_POINTS_4, LEGACY_POINTS_8 } from './points';
import { simulateResult, skillFor } from './demo';
import { makePlan } from './plan';
import { createRng } from './rng';
import {
  addPlayer, addPlayerToHeat, canMovePlayer, commitRound, createTournament, currentRound, defaultSettings, finalResults,
  finalsHeats, finalsPlan, isNameTaken, lateJoinSlots, movePlayer, phaseOf, previewRound, resolveSuddenDeath, roundComplete,
  saveHeatResult, scoreOf, standings, startFinals, swapHeats, upcoming, withdrawPlayer,
} from './tournament';
import { suddenDeathKey } from './ranking';
import type { Settings, Tournament } from './types';

let counter = 0;
const newId = () => `id${++counter}`;

/** Classic tournaments with the version 1 defaults, so these tests keep their numbers. */
function setup(n: number, patch: Partial<Settings> = {}): Tournament {
  const heatSize = patch.heatSize ?? 8;
  const legacy: Partial<Settings> = { format: 'classic', entryMode: 'per-race', heatSize, points: (heatSize === 4 ? LEGACY_POINTS_4 : LEGACY_POINTS_8).slice(), minutesPerRace: 2.5, cupOverheadMinutes: 0, expectedPlayers: 30 };
  let t = createTournament({ ...defaultSettings(), ...legacy, ...patch }, 'T', 0);
  for (let i = 0; i < n; i++) {
    const r = addPlayer(t, { name: `Player ${i + 1}`, avatar: 'fox', color: '#f00', status: 'checked-in' }, `p${i + 1}`, 0);
    if (!r.ok) throw new Error(r.error);
    t = r.t;
  }
  return t;
}

function playRound(t: Tournament, seed: number): Tournament {
  const p = previewRound(t, seed, newId, 0);
  if (!p.ok) throw new Error(p.error);
  t = commitRound(t, p.round);
  return playOpen(t, seed);
}

function playOpen(t: Tournament, seed: number): Tournament {
  const rng = createRng(seed);
  for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
  return t;
}

describe('registration', () => {
  it('[REQ-ENG-024] requires unique names, case-insensitive', () => {
    const t = setup(1);
    expect(isNameTaken(t, '  player 1 ')).toBe(true);
    const r = addPlayer(t, { name: 'PLAYER 1', avatar: 'fox', color: '#000' }, 'x', 0);
    expect(r).toEqual({ ok: false, error: 'name-taken' });
    expect(addPlayer(t, { name: '   ', avatar: 'fox', color: '#000' }, 'x', 0)).toEqual({ ok: false, error: 'name-required' });
  });

  it('[REQ-ENG-025] only checked-in / active players are put into heats; they become active', () => {
    let t = setup(8);
    const r = addPlayer(t, { name: 'No Show', avatar: 'fox', color: '#000', status: 'registered' }, 'ns', 0);
    if (!r.ok) throw new Error();
    t = r.t;
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    expect(p.round.heats.flatMap((h) => h.playerIds)).not.toContain('ns');
    expect(p.skipped.map((s) => s.id)).toEqual(['ns']);
    t = commitRound(t, p.round);
    expect(t.players.find((x) => x.id === 'p1')!.status).toBe('active');
    expect(t.players.find((x) => x.id === 'ns')!.status).toBe('registered');
  });

  it('[REQ-ENG-003] blocks a round with fewer than 3 players', () => {
    const p = previewRound(setup(2), 1, newId, 0);
    expect(p).toEqual({ ok: false, error: 'too-few-players', count: 2 });
  });

  it('[REQ-ENG-004] gives a bye when 5 players race at max 4', () => {
    const p = previewRound(setup(5, { heatSize: 4 }), 1, newId, 0);
    if (!p.ok) throw new Error();
    expect(p.round.heats.map((h) => h.playerIds.length)).toEqual([4]);
    expect(p.round.byes).toHaveLength(1);
  });
});

describe('rounds', () => {
  it('[REQ-ENG-030] next round only once the current round is complete', () => {
    let t = setup(16);
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    t = commitRound(t, p.round);
    expect(previewRound(t, 2, newId, 0)).toEqual({ ok: false, error: 'round-incomplete' });
    t = playOpen(t, 3);
    expect(roundComplete(currentRound(t)!)).toBe(true);
    expect(previewRound(t, 4, newId, 0).ok).toBe(true);
  });

  it('[REQ-ENG-009][REQ-ENG-010] swaps unplayed heats and moves players only when sizes stay valid', () => {
    let t = setup(30);
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    t = commitRound(t, p.round);
    const [h1, h2] = currentRound(t)!.heats;
    t = swapHeats(t, h1.id, h2.id);
    expect(currentRound(t)!.heats[0].id).toBe(h2.id);

    const heats = currentRound(t)!.heats;
    const big = heats.find((h) => h.playerIds.length === 8)!;
    const small = heats.find((h) => h.playerIds.length === 7)!;
    expect(canMovePlayer(t, big.playerIds[0], small.id)).toBe(true); // 8→7, 7→8
    expect(canMovePlayer(t, small.playerIds[0], big.id)).toBe(false); // would make a 9
    t = movePlayer(t, big.playerIds[0], small.id);
    expect(currentRound(t)!.heats.find((h) => h.id === small.id)!.playerIds).toHaveLength(8);
  });
});

describe('late registration', () => {
  it('[REQ-ENG-026] a late player joins from the next generated round, or an unplayed heat with room', () => {
    let t = setup(30);
    t = playRound(t, 1);
    const r = addPlayer(t, { name: 'Late Larry', avatar: 'fox', color: '#000', status: 'checked-in' }, 'late', 0);
    if (!r.ok) throw new Error();
    t = r.t;
    expect(r.player.joinedRound).toBe(1);
    // Round 1 is complete: no open slot to offer.
    expect(lateJoinSlots(t)).toEqual([]);
    const p = previewRound(t, 2, newId, 0);
    if (!p.ok) throw new Error();
    expect(p.round.heats.flatMap((h) => h.playerIds)).toContain('late');
    expect(p.round.heats.map((h) => h.playerIds.length).sort()).toEqual([7, 8, 8, 8]);

    // During round 2, a second late player can be dropped into an unplayed 7-heat.
    t = commitRound(t, p.round);
    const r2 = addPlayer(t, { name: 'Later Lisa', avatar: 'fox', color: '#000', status: 'checked-in' }, 'later', 0);
    if (!r2.ok) throw new Error();
    t = r2.t;
    const slots = lateJoinSlots(t);
    expect(slots).toHaveLength(1);
    t = addPlayerToHeat(t, 'later', slots[0].id);
    expect(t.players.find((x) => x.id === 'later')!.status).toBe('active');
    expect(currentRound(t)!.heats.find((h) => h.id === slots[0].id)!.playerIds).toContain('later');
  });
});

describe('withdrawal', () => {
  it('[REQ-ENG-028] removes the player from future heats but keeps past results', () => {
    let t = setup(30);
    t = playRound(t, 1);
    const before = standings(t).find((r) => r.playerId === 'p5')!;
    t = withdrawPlayer(t, 'p5');
    const after = standings(t).find((r) => r.playerId === 'p5')!;
    expect(after.total).toBe(before.total);
    expect(after.withdrawn).toBe(true);
    const p = previewRound(t, 2, newId, 0);
    if (!p.ok) throw new Error();
    expect(p.round.heats.flatMap((h) => h.playerIds)).not.toContain('p5');
    expect(p.round.heats.flatMap((h) => h.playerIds)).toHaveLength(29);
  });

  it('[REQ-ENG-028] removes the player from an unplayed heat of the current round', () => {
    let t = setup(16);
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    t = commitRound(t, p.round);
    const victim = currentRound(t)!.heats[0].playerIds[0];
    t = withdrawPlayer(t, victim);
    expect(currentRound(t)!.heats.flatMap((h) => h.playerIds)).not.toContain(victim);
  });
});

describe('full tournaments', () => {
  it('[REQ-ENG-017][REQ-ENG-035][REQ-ENG-038] 30 players, max 8: 3 rounds with a late join and a withdrawal → semis → grand final → podium', () => {
    let t = setup(30, { heatSize: 8 });
    t = playRound(t, 1);
    const r = addPlayer(t, { name: 'Late', avatar: 'fox', color: '#000', status: 'checked-in' }, 'late', 0);
    if (!r.ok) throw new Error();
    t = withdrawPlayer(r.t, 'p3');
    t = playRound(t, 2);
    t = playRound(t, 3);
    expect(phaseOf(t)).toBe('qualifying');
    const plan = finalsPlan(t);
    expect(plan.errors).toEqual([]);
    if (plan.tie) t = resolveSuddenDeath(t, { key: suddenDeathKey(plan.tie), order: plan.tie });
    t = startFinals(t, finalsPlan(t).stages!, newId, 1);
    expect(t.finals!.stages[0].heats.map((h) => h.playerIds.length)).toEqual([8, 8]);
    expect(t.finals!.stages[0].heats[0].playerIds.slice(0, 2)).toEqual([t.finals!.stages[0].seeds[0], t.finals!.stages[0].seeds[3]]);
    expect(t.finals!.stages[0].seeds).not.toContain('p3');
    t = playOpen(t, 5);
    expect(t.finals!.stages[1].heats).toHaveLength(1);
    expect(phaseOf(t)).toBe('finals');
    t = playOpen(t, 6);
    expect(phaseOf(t)).toBe('podium');
    const res = finalResults(t)!;
    expect(res).toHaveLength(31);
    expect(res.slice(0, 8).every((x) => x.stageReached === 1)).toBe(true);
    const gf = scoreOf(t, finalsHeats(t).at(-1)!)!;
    expect(res.slice(0, 3).map((x) => x.playerId)).toEqual(gf.slice(0, 3).map((s) => s.playerId));
  });

  it('[REQ-ENG-016][REQ-ENG-034] 11 players, max 4, console totals and a Last Chance heat', () => {
    let t = setup(11, { heatSize: 4, entryMode: 'totals', lastChance: true, lastChanceWildcards: 1 });
    for (let k = 1; k <= 3; k++) t = playRound(t, k);
    const plan = finalsPlan(t);
    expect(plan.stages!.map((s) => [s.fieldSize, s.wildcards])).toEqual([[8, 1], [4, 0]]);
    if (plan.tie) t = resolveSuddenDeath(t, { key: suddenDeathKey(plan.tie), order: plan.tie });
    t = startFinals(t, finalsPlan(t).stages!, newId, 1);
    const s0 = t.finals!.stages[0];
    expect(s0.lastChance!.playerIds).toHaveLength(4); // ranks 8..11
    expect(s0.heats).toHaveLength(0); // waits for the Last Chance winner
    t = playOpen(t, 7); // plays the Last Chance heat
    expect(t.finals!.stages[0].heats.map((h) => h.playerIds.length)).toEqual([4, 4]);
    t = playOpen(t, 8);
    t = playOpen(t, 9);
    expect(phaseOf(t)).toBe('podium');
    expect(finalResults(t)!.slice(0, 4).every((x) => x.stageReached === 1)).toBe(true);
  });

  it('[REQ-ENG-036] editing a semifinal before the final is raced re-seeds the final', () => {
    let t = setup(16, { heatSize: 8, qualRounds: 1 });
    t = playRound(t, 1);
    t = startFinals(t, finalsPlan(t).stages!, newId, 1);
    t = playOpen(t, 2);
    const semi = t.finals!.stages[0].heats[0];
    const reversed = { mode: 'per-race' as const, races: Array.from({ length: 4 }, () => semi.playerIds.slice().reverse()) };
    const before = t.finals!.stages[1].seeds;
    t = saveHeatResult(t, semi.id, reversed, 0, newId);
    expect(t.finals!.stages[1].seeds).not.toEqual(before);
    expect(t.finals!.stages[1].seeds).toContain(semi.playerIds[7]);
  });
});

describe('time estimate', () => {
  it('[REQ-PLAN-001] classic: (qualifying + finals heats) × (races × minutes + overhead + changeover)', () => {
    const s = setup(0).settings;
    const plan = makePlan(30, s);
    expect(plan.columns[0].sizes.length * plan.columns[0].repeat).toBe(12);
    expect(plan.heats - 12).toBe(3);
    expect(plan.minutesPerHeat).toBe(12);
    expect(plan.minutes).toBe(180);
    expect(makePlan(30, { ...s, cupOverheadMinutes: 3 }).minutes).toBe(225);
  });
});
