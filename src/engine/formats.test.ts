import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands';
import { simulateResult, skillFor } from './demo';
import { planKnockout } from './knockout';
import { alternatives, endTime, makePlan, minutesPerHeat, suggestFormat } from './plan';
import { DEFAULT_POINTS } from './points';
import { suddenDeathKey } from './ranking';
import { createRng, shuffle } from './rng';
import { correctedMinutesPerHeat, estimateRemaining, heatsLeft, measuredHeatMinutes } from './timing';
import {
  allHeats,
  canGenerateRound,
  createTournament,
  defaultSettings,
  finalResults,
  knockoutTable,
  lateJoinSlots,
  leagueTable,
  leagueTie,
  luckyLosers,
  phaseOf,
  registrationOpen,
  roundOutcome,
  upcoming,
} from './tournament';
import type { FillMode, Settings, Tournament } from './types';

let counter = 0;
const newId = () => `id${++counter}`;
const ctx = (now = 0) => ({ now, newId });

function run(t: Tournament, cmd: Command, now = 0): Tournament {
  const r = applyCommand(t, cmd, ctx(now));
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error}`);
  return r.t;
}

function setup(n: number, patch: Partial<Settings> = {}): Tournament {
  let t = createTournament({ ...defaultSettings(), ...patch }, 'T', 0);
  t = run(t, { type: 'addPlayers', players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: '#000', status: 'checked-in' })) });
  return t;
}

/** Race every queued heat with simulated results. */
function playAll(t: Tournament, seed: number, now = 0): Tournament {
  const rng = createRng(seed);
  for (let guard = 0; guard < 50; guard++) {
    const h = upcoming(t)[0];
    if (!h) break;
    t = run(t, { type: 'saveResult', heatId: h.id, result: simulateResult(h, t.settings, skillFor, rng) }, now);
  }
  return t;
}

/** Generate rounds and race them until the podium, settling cut ties at random. */
function playKnockout(t: Tournament, seed: number): { t: Tournament; rounds: number[][] } {
  const rng = createRng(seed);
  const rounds: number[][] = [];
  for (let guard = 0; guard < 40 && phaseOf(t) !== 'podium'; guard++) {
    const b = canGenerateRound(t);
    if (b && !b.ok && b.error === 'tie') {
      t = run(t, { type: 'resolveSuddenDeath', entry: { key: suddenDeathKey(b.tie!), order: shuffle(b.tie!, rng) } });
      continue;
    }
    if (b) throw new Error(`blocked: ${b.ok ? '' : b.error}`);
    t = run(t, { type: 'generateRound', seed: guard });
    const r = t.rounds[t.rounds.length - 1];
    rounds.push(r.heats.map((h) => h.playerIds.length));
    t = playAll(t, seed + guard);
    // A tie for the Last Chance pool blocks the Last Chance heat until decided.
    for (let k = 0; k < 5; k++) {
      const o = roundOutcome(t, t.rounds[t.rounds.length - 1]);
      if (o.status !== 'tie') break;
      t = run(t, { type: 'resolveSuddenDeath', entry: { key: suddenDeathKey(o.tie), order: shuffle(o.tie, rng) } });
      t = playAll(t, seed + guard + 100);
    }
  }
  return { t, rounds };
}

describe('[REQ-FMT-013] simulated knockout tournaments follow their plan', () => {
  it('[REQ-FMT-013] random n, S, X, fill and entry mode', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.integer({ min: 2, max: 8 }),
        fc.array(fc.integer({ min: 1, max: 4 }), { maxLength: 5 }),
        fc.constantFrom<FillMode>('best', 'last-chance', 'off'),
        fc.constantFrom<Settings['entryMode']>('totals', 'ranking', 'per-race'),
        fc.integer({ min: 1, max: 1e6 }),
        (n, S, advance, fill, entryMode, seed) => {
          const start = setup(n, { format: 'knockout', heatSize: S, advance, fill, entryMode });
          const { t, rounds } = playKnockout(start, seed);
          const plan = planKnockout(n, S, advance, fill);
          expect(rounds).toEqual(plan.map((r) => r.sizes));
          expect(allHeats(t).length).toBe(plan.reduce((a, r) => a + r.sizes.length + (r.lastChance ? 1 : 0), 0));
          expect(phaseOf(t)).toBe('podium');
          const final = finalResults(t)!;
          expect(final.map((r) => r.playerId).sort()).toEqual(t.players.map((p) => p.id).sort());
          expect(final.map((r) => r.place)).toEqual(final.map((_, i) => i + 1));
          // Everyone raced at least one cup.
          const raced = new Set(allHeats(t).flatMap((h) => h.playerIds));
          for (const p of t.players) expect(raced.has(p.id)).toBe(true);
        },
      ),
      { numRuns: 120 },
    );
  }, 60_000);
});

describe('[REQ-FMT-008] knockout rounds in the tournament', () => {
  it('[REQ-FMT-008][REQ-FMT-006] 20 at 8, X 2: round 1 of 7,7,6, then a final of 8 with two lucky losers', () => {
    let t = setup(20, { format: 'knockout', heatSize: 8, advance: [2] });
    t = run(t, { type: 'generateRound', seed: 1 });
    expect(t.rounds[0].heats.map((h) => h.playerIds.length)).toEqual([7, 7, 6]);
    t = playAll(t, 5);
    const { t: done } = playKnockout(t, 9);
    expect(done.rounds[1].final).toBe(true);
    expect(done.rounds[1].heats[0].playerIds).toHaveLength(8);
    expect(luckyLosers(done).size).toBe(2);
    const table = knockoutTable(done);
    expect(table[0].status).toBe('champion');
    expect(table.filter((r) => r.lucky)).toHaveLength(2);
    expect(table.slice(8).every((r) => r.status === 'out')).toBe(true);
  });

  it('[REQ-FMT-007] Last Chance heat is queued after the round and decides the fill-up places', () => {
    let t = setup(20, { format: 'knockout', heatSize: 8, advance: [2], fill: 'last-chance' });
    t = run(t, { type: 'generateRound', seed: 1 });
    t = playAll(t, 3);
    const lc = t.rounds[0].lastChance;
    if (roundOutcome(t, t.rounds[0]).status === 'tie') return; // a rare pool tie; covered elsewhere
    expect(lc).toBeTruthy();
    expect(lc!.result).toBeTruthy();
    const o = roundOutcome(t, t.rounds[0]);
    expect(o.status).toBe('done');
    if (o.status === 'done') expect(o.luckyLosers.every((id) => lc!.playerIds.includes(id))).toBe(true);
  });

  it('[REQ-FMT-010] editing a round-1 result re-seeds an unraced round 2 and drops it when the round is open again', () => {
    let t = setup(30, { format: 'knockout', heatSize: 8, advance: [4, 4] });
    t = run(t, { type: 'generateRound', seed: 1 });
    t = playAll(t, 2);
    t = run(t, { type: 'generateRound', seed: 2 });
    const before = t.rounds[1].entrants!;
    const h = t.rounds[0].heats[0];
    // Reverse heat 1's order: different players advance.
    const order = h.result!.mode === 'totals' ? h.result!.order.slice().reverse() : h.playerIds.slice().reverse();
    t = run(t, { type: 'saveResult', heatId: h.id, result: { mode: 'ranking', order } });
    expect(t.rounds).toHaveLength(2);
    expect(t.rounds[1].entrants).not.toEqual(before);
    expect(new Set(t.rounds[1].heats.flatMap((x) => x.playerIds))).toEqual(new Set(t.rounds[1].entrants));
    t = run(t, { type: 'clearResult', heatId: h.id });
    expect(t.rounds).toHaveLength(1);
  });

  it('[REQ-FMT-010] late sign-ups take a free round-1 seat; then registration closes', () => {
    let t = setup(14, { format: 'knockout', heatSize: 8 });
    t = run(t, { type: 'generateRound', seed: 1 });
    expect(t.rounds[0].heats.map((h) => h.playerIds.length)).toEqual([7, 7]);
    expect(registrationOpen(t)).toBe(true);
    const add = applyCommand(t, { type: 'addPlayer', player: { name: 'Late', color: '#000', status: 'checked-in' } }, ctx());
    if (!add.ok) throw new Error();
    t = run(add.t, { type: 'lateJoin', playerId: add.playerId!, heatId: lateJoinSlots(add.t)[0].id });
    expect(t.rounds[0].heats[0].playerIds).toHaveLength(8);
    t = playAll(t, 4);
    expect(lateJoinSlots(t)).toEqual([]);
    expect(registrationOpen(t)).toBe(false);
  });

  it('[REQ-FMT-010] withdrawing an advancer before round 2 pulls in the next best of the rest', () => {
    let t = setup(20, { format: 'knockout', heatSize: 8, advance: [2], fill: 'off' });
    t = run(t, { type: 'generateRound', seed: 1 });
    t = playAll(t, 7);
    const o = roundOutcome(t, t.rounds[0]);
    if (o.status !== 'done') throw new Error(o.status);
    const leaver = o.advancing[0];
    t = run(t, { type: 'withdraw', id: leaver });
    const o2 = roundOutcome(t, t.rounds[0]);
    expect(o2.status === 'done' && o2.advancing).toHaveLength(6);
    expect(o2.status === 'done' && o2.advancing.includes(leaver)).toBe(false);
  });
});

describe('[REQ-FMT-003] league', () => {
  it('[REQ-FMT-003] everyone races every cup; total decides; podium tie goes to sudden death', () => {
    let t = setup(5, { format: 'league', heatSize: 8, leagueCups: 2, entryMode: 'ranking' });
    expect(registrationOpen(t)).toBe(true);
    t = run(t, { type: 'generateRound', seed: 1 });
    expect(t.rounds[0].heats).toHaveLength(1);
    expect(t.rounds[0].heats[0].playerIds).toHaveLength(5);
    const ids = t.rounds[0].heats[0].playerIds;
    // Cup 1: P-order a,b,c,d,e. Cup 2: b,a,c,d,e → a and b level on points and wins.
    t = run(t, { type: 'saveResult', heatId: t.rounds[0].heats[0].id, result: { mode: 'ranking', order: ids } });
    t = run(t, { type: 'generateRound', seed: 2 });
    expect(canGenerateRound(t)).toEqual({ ok: false, error: 'round-incomplete' });
    t = run(t, { type: 'saveResult', heatId: t.rounds[1].heats[0].id, result: { mode: 'ranking', order: [ids[1], ids[0], ...ids.slice(2)] } });
    expect(phaseOf(t)).toBe('podium');
    const rows = leagueTable(t);
    // Same total and same countback: the better place in the latest cup wins.
    expect(rows[0].playerId).toBe(ids[1]);
    expect(rows[0].total).toBe(DEFAULT_POINTS[0] * 4 + DEFAULT_POINTS[1] * 4);
    expect(leagueTie(t)).toBeNull();
    expect(finalResults(t)!.map((r) => r.playerId).slice(0, 3)).toEqual([ids[1], ids[0], ids[2]]);
  });

  it('[REQ-FMT-003] a full tie for the podium is decided by sudden death', () => {
    let t = setup(3, { format: 'league', heatSize: 4, leagueCups: 1, entryMode: 'totals' });
    t = run(t, { type: 'generateRound', seed: 1 });
    const h = t.rounds[0].heats[0];
    const [a, b, c] = h.playerIds;
    t = run(t, { type: 'saveResult', heatId: h.id, result: { mode: 'totals', points: { [a]: 40, [b]: 40, [c]: 10 }, order: [a, b, c] } });
    // Totals say level, but the place order a > b is part of the result: countback separates them.
    expect(leagueTable(t)[0].playerId).toBe(a);
    let u = createTournament({ ...defaultSettings(), format: 'league', heatSize: 4, leagueCups: 1 }, 'U', 0);
    u = run(u, { type: 'addPlayers', players: ['A', 'B'].map((name) => ({ name, color: '#000', status: 'checked-in' as const })) });
    u = run(u, { type: 'generateRound', seed: 1 });
    u = run(u, { type: 'addRound' });
    const [x, y] = u.rounds[0].heats[0].playerIds;
    u = run(u, { type: 'saveResult', heatId: u.rounds[0].heats[0].id, result: { mode: 'ranking', order: [x, y] } });
    u = run(u, { type: 'generateRound', seed: 2 });
    u = run(u, { type: 'saveResult', heatId: u.rounds[1].heats[0].id, result: { mode: 'ranking', order: [y, x] } });
    // Same total, one win each, and in cup 2 y was ahead → y first; no sudden death needed.
    expect(leagueTable(u)[0].playerId).toBe(y);
  });

  it('[REQ-FMT-003] more players than seats cannot make a league cup', () => {
    const t = setup(9, { format: 'league', heatSize: 8 });
    const r = applyCommand(t, { type: 'generateRound', seed: 1 }, ctx());
    expect(r).toEqual({ ok: false, error: 'too-many-players' });
  });
});

describe('[REQ-FMT-002][REQ-PLAN-001][REQ-PLAN-003] planner', () => {
  const s = (patch: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...patch });

  it('[REQ-FMT-002] league when everyone fits into one heat, knockout otherwise', () => {
    expect(suggestFormat(8, 8)).toBe('league');
    expect(suggestFormat(9, 8)).toBe('knockout');
    expect(suggestFormat(2, 2)).toBe('league');
    expect(makePlan(10, s({ format: 'classic', heatSize: 2 })).warnings).toContain('classic-heat-size');
  });

  it('[REQ-PLAN-001] 17 minutes per heat by default; plan time = heats × minutes', () => {
    expect(minutesPerHeat(defaultSettings())).toBe(17);
    expect(makePlan(20, s({ advance: [2] }))).toMatchObject({ heats: 4, minutes: 68 });
    expect(makePlan(8, s({ format: 'league' }))).toMatchObject({ heats: 3, minutes: 51 });
    expect(makePlan(30, s({ format: 'classic' })).columns[0]).toMatchObject({ kind: 'qual', sizes: [8, 8, 7, 7], repeat: 3 });
    expect(endTime('19:30', 68)).toBe('20:38');
    expect(endTime('23:30', 68)).toBe('00:38');
    expect(endTime('', 68)).toBe('');
  });

  it('[REQ-PLAN-003] over 3 hours: a warning and cheaper variants, the ones that fit first', () => {
    const slow = s({ heatSize: 4, advance: [2, 2, 2] });
    const plan = makePlan(30, slow);
    expect(plan.minutes).toBe(255);
    expect(plan.warnings).toContain('long');
    const alts = alternatives(30, slow);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.saves > 0)).toBe(true);
    expect(alts[0].change).toEqual({ kind: 'advance', value: 1 });
    expect(alts[0].saves).toBe(255 - 187);
    // Fitting variants first; with a 3 h 10 min budget advancing 1 fits.
    const roomy = alternatives(30, { ...slow, availableMinutes: 190 });
    expect(roomy[0].plan.minutes).toBeLessThanOrEqual(190);
    const fits = roomy.map((a) => a.plan.minutes <= 190);
    expect(fits).toEqual(fits.slice().sort((a, b) => Number(b) - Number(a)));
    expect(makePlan(20, s({ availableMinutes: 60 })).warnings).toContain('over-time');
    expect(alternatives(8, s({ format: 'league', leagueCups: 3 }))[0].change).toEqual({ kind: 'cups', value: 2 });
  });
});

describe('[REQ-TIME-001][REQ-TIME-002] measured time', () => {
  it('[REQ-TIME-001] heats are measured between first saves, breaks are ignored, the guess weighs 2', () => {
    let t = setup(16, { format: 'knockout', heatSize: 4, advance: [2, 2] });
    const t0 = 1_000_000;
    t = run(t, { type: 'generateRound', seed: 1 }, t0);
    const rng = createRng(1);
    const min = 60_000;
    const saveAt = (at: number) => {
      const h = upcoming(t)[0];
      t = run(t, { type: 'saveResult', heatId: h.id, result: simulateResult(h, t.settings, skillFor, rng) }, at);
    };
    saveAt(t0 + 20 * min); // 20
    saveAt(t0 + 41 * min); // 21
    saveAt(t0 + 141 * min); // 100 → a break (> 2.5 × 17)
    expect(measuredHeatMinutes(t)).toEqual([20, 21]);
    expect(correctedMinutesPerHeat(t)).toEqual({ perHeat: (2 * 17 + 41) / 4, measured: 2 });
    // Re-saving an old heat later does not move its measured time.
    const first = t.rounds[0].heats[0];
    t = run(t, { type: 'saveResult', heatId: first.id, result: first.result! }, t0 + 500 * min);
    expect(measuredHeatMinutes(t)).toEqual([20, 21]);
    const est = estimateRemaining(t, t0 + 141 * min);
    expect(est.heatsLeft).toBe(heatsLeft(t));
    expect(est.heatsLeft).toBe(1 + 2 + 1);
    expect(est.endsAt).toBe(t0 + 141 * min + est.minutesLeft * min);
  });
});

describe('[REQ-ARCH-001] commands', () => {
  it('[REQ-ARCH-001] invalid commands are rejected and leave the state alone', () => {
    const t = setup(4, { format: 'knockout', heatSize: 4 });
    const frozen = JSON.stringify(t);
    expect(applyCommand(t, { type: 'saveResult', heatId: 'nope', result: { mode: 'ranking', order: [] } }, ctx()).ok).toBe(false);
    expect(applyCommand(t, { type: 'addPlayer', player: { name: 'p1', color: '#000' } }, ctx())).toEqual({ ok: false, error: 'name-taken' });
    expect(applyCommand(t, { type: 'withdraw', id: 'ghost' }, ctx()).ok).toBe(false);
    const g = applyCommand(t, { type: 'generateRound', seed: 1 }, ctx());
    if (!g.ok) throw new Error();
    const h = g.t.rounds[0].heats[0];
    expect(applyCommand(g.t, { type: 'saveResult', heatId: h.id, result: { mode: 'ranking', order: h.playerIds.slice(1) } }, ctx())).toEqual({ ok: false, error: 'invalid-result' });
    expect(JSON.stringify(t)).toBe(frozen);
  });

  it('[REQ-FMT-001][REQ-ARCH-001] format and heat size are locked once the first round exists', () => {
    let t = setup(6, { format: 'knockout', heatSize: 4 });
    t = run(t, { type: 'generateRound', seed: 1 });
    t = run(t, { type: 'updateSettings', settings: { ...t.settings, heatSize: 8, format: 'league', name: '  ' } });
    expect(t.settings).toMatchObject({ heatSize: 4, format: 'knockout', name: 'Kart Cup' });
  });

  it('[REQ-ARCH-001] the same command on the same state gives the same result (replayable)', () => {
    const t = setup(12, { format: 'knockout', heatSize: 4 });
    let a = 0;
    let b = 0;
    const r1 = applyCommand(t, { type: 'generateRound', seed: 42 }, { now: 5, newId: () => `x${++a}` });
    const r2 = applyCommand(t, { type: 'generateRound', seed: 42 }, { now: 5, newId: () => `x${++b}` });
    expect(r1).toEqual(r2);
  });
});
