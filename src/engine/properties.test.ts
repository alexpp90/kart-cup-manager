// Property tests over randomly played tournaments (late joins, withdrawals,
// edits), plus registration, CSV and purity rules.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { standingsCsv } from './csv';
import { simulateResult, skillFor } from './demo';
import { snakeSeed } from './finals';
import { MIN_HEAT_SIZE } from './heats';
import { pointsForPlace, scoreHeat } from './points';
import { createRng, type Rng } from './rng';
import {
  addPlayer, addPlayerToHeat, allHeats, canDeletePlayer, clearHeatResult, commitRound, createTournament, defaultSettings,
  deletePlayer, finalsPlan, isPlayed, lateJoinSlots, movePlayer, previewRound, reinstatePlayer, roundComplete, saveHeatResult,
  standings, startFinals, swapHeats, tableFor, upcoming, withdrawPlayer, currentRound, cancelFinals, randomCupFor, setHeatCup,
  setQualRounds, resolveSuddenDeath, updatePlayer,
} from './tournament';
import { suddenDeathKey } from './ranking';
import type { HeatMax, Settings, Tournament } from './types';

let counter = 0;
const newId = () => `id${++counter}`;

function setup(n: number, patch: Partial<Settings> = {}): Tournament {
  let t = createTournament({ ...defaultSettings(), ...patch }, 'T', 0);
  for (let i = 0; i < n; i++) {
    const r = addPlayer(t, { name: `Player ${i + 1}`, avatar: 'fox', color: '#f00', status: 'checked-in' }, `p${i + 1}`, 0);
    if (!r.ok) throw new Error(r.error);
    t = r.t;
  }
  return t;
}

/** Play one random event: generate/play heats, late join, withdraw, reinstate, edit. Returns the new state. */
function randomStep(t: Tournament, rng: Rng, step: number): Tournament {
  const roll = rng();
  const active = t.players.filter((p) => p.status !== 'withdrawn' && p.status !== 'registered');
  if (roll < 0.08) {
    const r = addPlayer(t, { name: `Late ${step}`, avatar: 'cat', color: '#00f', status: 'checked-in' }, `late${step}`, 0);
    if (r.ok) {
      t = r.t;
      const slot = lateJoinSlots(t)[0];
      if (slot && rng() < 0.5) t = addPlayerToHeat(t, r.player.id, slot.id);
    }
    return t;
  }
  if (roll < 0.14 && active.length > 4) return withdrawPlayer(t, active[Math.floor(rng() * active.length)].id);
  if (roll < 0.17) {
    const w = t.players.find((p) => p.status === 'withdrawn');
    return w ? reinstatePlayer(t, w.id) : t;
  }
  if (roll < 0.22) {
    const played = allHeats(t).filter(isPlayed);
    if (played.length) return clearHeatResult(t, played[Math.floor(rng() * played.length)].id, newId);
  }
  const next = upcoming(t)[0];
  if (next) {
    // Skip heats emptied below 2 by withdrawals (documented known limitation D-2).
    if (next.playerIds.length < 2) return withdrawPlayer(t, next.playerIds[0] ?? 'none');
    return saveHeatResult(t, next.id, simulateResult(next, t.settings, skillFor, rng), 0, newId);
  }
  const p = previewRound(t, Math.floor(rng() * 1e6), newId, 0);
  return p.ok ? commitRound(t, p.round) : t;
}

function randomTournament(seed: number, n: number, max: HeatMax, steps = 30): Tournament[] {
  const rng = createRng(seed);
  let t = setup(n, { maxPerHeat: max, qualRounds: 3, entryMode: rng() < 0.5 ? 'per-race' : 'totals' });
  const states = [t];
  for (let i = 0; i < steps; i++) {
    t = randomStep(t, rng, i);
    states.push(t);
  }
  return states;
}

const arb = fc.record({ seed: fc.integer({ min: 1, max: 2 ** 30 }), n: fc.integer({ min: 4, max: 32 }), max: fc.constantFrom<HeatMax>(4, 8) });
// Each run plays a whole random tournament with real pairing; keep runs moderate.
const RUNS = { numRuns: 25 };
const SLOW = 60_000;

describe('properties over random tournaments', () => {
  it('[REQ-ENG-042] heat sizes are 3..max with spread ≤ 1 in every generated round', () => {
    fc.assert(
      fc.property(arb, ({ seed, n, max }) => {
        const states = randomTournament(seed, n, max);
        for (const t of states) {
          // Check each round as it was generated (the round's state right after commit).
          const r = currentRound(t);
          if (!r || r.heats.some(isPlayed)) continue;
          const sizes = r.heats.map((h) => h.playerIds.length);
          if (states.indexOf(t) > 0 && states[states.indexOf(t) - 1].rounds.length === t.rounds.length) continue;
          expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_HEAT_SIZE);
          expect(Math.max(...sizes)).toBeLessThanOrEqual(max);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('[REQ-ENG-043] no withdrawn player is in any unplayed or future heat', () => {
    fc.assert(
      fc.property(arb, ({ seed, n, max }) => {
        const states = randomTournament(seed, n, max);
        for (const t of states) {
          const withdrawn = new Set(t.players.filter((p) => p.status === 'withdrawn').map((p) => p.id));
          for (const h of allHeats(t)) if (!isPlayed(h)) for (const id of h.playerIds) expect(withdrawn.has(id), JSON.stringify({ id, h })).toBe(false);
        }
        const last = states[states.length - 1];
        const withdrawn = new Set(last.players.filter((p) => p.status === 'withdrawn').map((p) => p.id));
        const p = previewRound(last, 1, newId, 0);
        if (p.ok) for (const h of p.round.heats) for (const id of h.playerIds) expect(withdrawn.has(id)).toBe(false);
      }),
      RUNS,
    );
  }, SLOW);

  it('[REQ-ENG-044] standings are deterministic and identical after an edit and its revert', () => {
    fc.assert(
      fc.property(arb, ({ seed, n, max }) => {
        const states = randomTournament(seed, n, max);
        const t = states[states.length - 1];
        expect(standings(t)).toEqual(standings(structuredClone(t)));
        const played = allHeats(t).filter(isPlayed);
        if (!played.length) return;
        const h = played[seed % played.length];
        const r = h.result!;
        const edited =
          r.mode === 'per-race'
            ? { ...r, races: r.races.map((race) => race.slice().reverse()) }
            : { ...r, order: r.order.slice().reverse(), points: Object.fromEntries(r.order.map((id, i) => [id, r.points[r.order[r.order.length - 1 - i]]])) };
        const changed = saveHeatResult(t, h.id, edited, 1, newId);
        const restored = saveHeatResult(changed, h.id, r, h.savedAt ?? 0, newId);
        expect(standings(restored)).toEqual(standings(t));
        if (!t.players.some((p) => p.status === 'withdrawn')) {
          const cleared = clearHeatResult(t, h.id, newId);
          expect(standings(saveHeatResult(cleared, h.id, r, h.savedAt ?? 0, newId))).toEqual(standings(t));
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('[REQ-ENG-045] heat points equal the points table for the placings (per race) or the typed totals', () => {
    fc.assert(
      fc.property(arb, ({ seed, n, max }) => {
        const t = randomTournament(seed, n, max).pop()!;
        const table = tableFor(t);
        for (const h of allHeats(t).filter(isPlayed)) {
          const scores = scoreHeat(h, table)!;
          const r = h.result!;
          if (r.mode === 'per-race') {
            const expected = r.races.reduce((sum, race) => sum + race.reduce((s, _, i) => s + pointsForPlace(table, i + 1), 0), 0);
            expect(scores.reduce((s, x) => s + x.points, 0)).toBe(expected);
          } else {
            for (const s of scores) expect(s.points).toBe(r.points[s.playerId]);
          }
          expect(scores.map((s) => s.place).sort((a, b) => a - b)).toEqual(scores.map((_, i) => i + 1));
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('[REQ-ENG-046] finals seeding follows the qualifying standings (snake over ranked eligible players)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.integer({ min: 8, max: 40 }), fc.constantFrom<HeatMax>(4, 8), (seed, n, max) => {
        const rng = createRng(seed);
        let t = setup(n, { maxPerHeat: max, qualRounds: 2 });
        for (let r = 0; r < 2; r++) {
          const p = previewRound(t, seed + r, newId, 0);
          if (!p.ok) throw new Error(p.error);
          t = commitRound(t, p.round);
          for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
        }
        let plan = finalsPlan(t);
        for (let guard = 0; plan.tie && guard < 10; guard++) {
          t = resolveSuddenDeath(t, { key: suddenDeathKey(plan.tie), order: plan.tie });
          plan = finalsPlan(t);
        }
        if (plan.errors.length || !plan.stages) return;
        const started = startFinals(t, plan.stages, newId, 0);
        const stage = started.finals!.stages[0];
        const ranked = finalsPlan(t).eligible.map((r) => r.playerId);
        expect(stage.seeds).toEqual(ranked.slice(0, stage.config.fieldSize - stage.config.wildcards));
        if (!stage.config.wildcards) {
          expect(stage.heats.map((h) => h.playerIds)).toEqual(snakeSeed(stage.seeds, stage.config.fieldSize / stage.config.heatSize));
        }
      }),
      { numRuns: 20 },
    );
  }, SLOW);
});

describe('registration rules', () => {
  it('[REQ-ENG-027] a player who registers after qualifying ended cannot enter the finals', () => {
    const rng = createRng(3);
    let t = setup(9, { qualRounds: 1 });
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    t = commitRound(t, p.round);
    for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
    expect(roundComplete(currentRound(t)!)).toBe(true);
    const r = addPlayer(t, { name: 'Too Late', avatar: 'fox', color: '#000', status: 'checked-in' }, 'late', 0);
    if (!r.ok) throw new Error();
    t = r.t;
    expect(lateJoinSlots(t)).toEqual([]);
    const row = standings(t).find((s) => s.playerId === 'late')!;
    expect(row.heats).toBe(0);
    expect(row.eligible).toBe(false);
    expect(finalsPlan(t).eligible.map((e) => e.playerId)).not.toContain('late');
  });

  it('[REQ-ENG-029] a withdrawn player can be reinstated for the next round; delete only while never in a heat', () => {
    let t = setup(9);
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    t = commitRound(t, p.round);
    const rng = createRng(5);
    for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
    t = withdrawPlayer(t, 'p1');
    t = reinstatePlayer(t, 'p1');
    const p1 = t.players.find((x) => x.id === 'p1')!;
    expect(p1.status).toBe('checked-in');
    expect(p1.joinedRound).toBe(1);
    expect(canDeletePlayer(t, 'p1')).toBe(false);
    expect(deletePlayer(t, 'p1')).toBe(t);
    const r = addPlayer(t, { name: 'Fresh', avatar: 'fox', color: '#000' }, 'fresh', 0);
    if (!r.ok) throw new Error();
    expect(canDeletePlayer(r.t, 'fresh')).toBe(true);
    expect(deletePlayer(r.t, 'fresh').players.map((x) => x.id)).not.toContain('fresh');
  });
});

describe('CSV export', () => {
  it('[REQ-ENG-047] has a BOM, commas, localized headers, one row per player and escapes quotes, commas and emoji', () => {
    let t = setup(3);
    t = updatePlayer(t, 'p1', { name: 'Ann "Speedy", 🏎️' });
    t = updatePlayer(t, 'p2', { tag: 'a;b' });
    const headers = ['Platz', 'Name', 'Tag', 'Läufe', 'Punkte', 'Schnitt', 'Siege', 'Beste', 'Finale', 'Status'];
    const csv = standingsCsv(standings(t), t.players, { headers, yes: 'ja', no: 'nein', withdrawn: 'zurückgezogen', active: 'aktiv' });
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe(headers.join(','));
    expect(lines).toHaveLength(4);
    expect(csv).toContain('"Ann ""Speedy"", 🏎️"');
    expect(csv).toContain('"a;b"');
    for (const line of lines.slice(1)) expect(line.split(',').length).toBeGreaterThanOrEqual(10);
    expect(lines[1].endsWith(',nein,aktiv')).toBe(true);
  });
});

/** Recursively freeze so any mutation throws. */
function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

describe('purity', () => {
  it('[REQ-ENG-049] engine transitions never mutate their input tournament', () => {
    const rng = createRng(11);
    let t = setup(12, { lastChance: true, qualRounds: 2 });
    const check = (label: string, fn: (x: Tournament) => unknown) => {
      const frozen = deepFreeze(structuredClone(t));
      const before = JSON.stringify(frozen);
      expect(() => fn(frozen), label).not.toThrow();
      expect(JSON.stringify(frozen), label).toBe(before);
    };
    check('addPlayer', (x) => addPlayer(x, { name: 'New', avatar: 'fox', color: '#000' }, 'n', 0));
    check('previewRound', (x) => previewRound(x, 1, newId, 0));
    const p = previewRound(t, 1, newId, 0);
    if (!p.ok) throw new Error();
    check('commitRound', (x) => commitRound(x, p.round));
    t = commitRound(t, p.round);
    const [h1, h2] = t.rounds[0].heats;
    check('swapHeats', (x) => swapHeats(x, h1.id, h2.id));
    check('movePlayer', (x) => movePlayer(x, h1.playerIds[0], h2.id));
    check('withdrawPlayer', (x) => withdrawPlayer(x, 'p1'));
    check('reinstatePlayer', (x) => reinstatePlayer(x, 'p1'));
    check('updatePlayer', (x) => updatePlayer(x, 'p1', { name: 'Renamed' }));
    check('deletePlayer', (x) => deletePlayer(x, 'p1'));
    check('setHeatCup', (x) => setHeatCup(x, h1.id, randomCupFor(x, 1)));
    check('setQualRounds', (x) => setQualRounds(x, 4));
    const res = simulateResult(h1, t.settings, skillFor, rng);
    check('saveHeatResult', (x) => saveHeatResult(x, h1.id, res, 0, newId));
    for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
    check('clearHeatResult', (x) => clearHeatResult(x, h1.id, newId));
    check('standings', (x) => standings(x));
    const p2 = previewRound(t, 2, newId, 0);
    if (!p2.ok) throw new Error();
    t = commitRound(t, p2.round);
    for (const h of upcoming(t)) t = saveHeatResult(t, h.id, simulateResult(h, t.settings, skillFor, rng), 0, newId);
    let plan = finalsPlan(t);
    for (let g = 0; plan.tie && g < 10; g++) {
      check('resolveSuddenDeath', (x) => resolveSuddenDeath(x, { key: suddenDeathKey(plan.tie!), order: plan.tie! }));
      t = resolveSuddenDeath(t, { key: suddenDeathKey(plan.tie), order: plan.tie });
      plan = finalsPlan(t);
    }
    check('startFinals', (x) => startFinals(x, plan.stages!, newId, 0));
    t = startFinals(t, plan.stages!, newId, 0);
    check('cancelFinals', (x) => cancelFinals(x));
    const lc = t.finals!.stages[0].lastChance ?? t.finals!.stages[0].heats[0];
    check('saveHeatResult (finals)', (x) => saveHeatResult(x, lc.id, simulateResult(lc, x.settings, skillFor, rng), 0, newId));
  });
});
