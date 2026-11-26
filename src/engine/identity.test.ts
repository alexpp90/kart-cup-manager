import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COLORS } from '../data/colors';
import { applyCommand, type Command } from './commands';
import { badgeTextColor, initialCandidates, initialsForNew, initialsMap, pickColor, playerMarks } from './identity';
import { bySeat, createTournament, defaultSettings, lateJoinSlots, seatAdd, seatRemove, seatsOf } from './tournament';
import type { Heat, Settings, Tournament } from './types';
import { migrateTournament } from '../store/persist';

let n = 0;
const ctx = { now: 0, newId: () => `i${++n}` };
const run = (t: Tournament, cmd: Command) => {
  const r = applyCommand(t, cmd, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.t;
};
const setup = (names: string[], patch: Partial<Settings> = {}) =>
  run(createTournament({ ...defaultSettings(), ...patch }, 'T', 0), { type: 'addPlayers', players: names.map((name) => ({ name, status: 'checked-in' as const })) });

/** WCAG contrast ratio of two hex colours. */
function contrast(a: string, b: string): number {
  const L = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('[REQ-UI-027][REQ-UI-028] players without characters', () => {
  it('[REQ-UI-027] new players get the least-used colour; 30 players spread over the palette', () => {
    const t = setup(Array.from({ length: 30 }, (_, i) => `Racer ${i + 1}`));
    const counts = COLORS.map((c) => t.players.filter((p) => p.color === c).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(pickColor([])).toBe(COLORS[0]);
    expect(t.players.every((p) => !('avatar' in p) && !('favorite' in p))).toBe(true);
  });

  it('[REQ-UI-027] a colour outside the palette is not accepted', () => {
    const t = setup(['Ann']);
    expect(applyCommand(t, { type: 'updatePlayer', id: t.players[0].id, patch: { color: 'javascript:alert(1)' } }, ctx)).toEqual({ ok: false, error: 'bad-color' });
    const added = run(t, { type: 'addPlayer', player: { name: 'Ben', color: 'red' } });
    expect(COLORS).toContain(added.players[1].color);
  });

  it('[REQ-UI-028] initials are unique where the names allow; earlier sign-ups keep theirs', () => {
    expect(initialCandidates('Lightning Lena')[0]).toBe('LL');
    expect(initialCandidates('Ömer')[0]).toBe('ÖM');
    expect(initialCandidates('🏎️ Zoe')[0]).toBe('ZO');
    const t = setup(['Ben', 'Bea', 'Bert', 'Anna Bell', 'Anna Bolt']);
    const m = initialsMap(t.players);
    const values = t.players.map((p) => m.get(p.id));
    expect(values).toEqual(['BE', 'BA', 'BR', 'AB', 'AN']);
    expect(new Set(values).size).toBe(5);
    // A later sign-up never changes an earlier badge.
    const more = run(t, { type: 'addPlayer', player: { name: 'Be' } });
    const m2 = initialsMap(more.players);
    expect(t.players.map((p) => m2.get(p.id))).toEqual(values);
    expect(initialsForNew(t.players, 'Bella')).toBe('BL');
  });

  it('[REQ-UI-028] badge text is readable on every palette colour (≥ 4.5:1 for the initials)', () => {
    for (const c of COLORS) expect(contrast(c, badgeTextColor(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it('[REQ-UI-028] marks: crown for the leader, flames for two wins in a row, clover for a lucky loser', () => {
    let t = setup(Array.from({ length: 16 }, (_, i) => `P${i + 1}`), { format: 'knockout', heatSize: 8, advance: [2], entryMode: 'ranking' });
    t = run(t, { type: 'generateRound', seed: 1 });
    for (const h of t.rounds[0].heats) t = run(t, { type: 'saveResult', heatId: h.id, result: { mode: 'ranking', order: h.playerIds } });
    // Two heats of 8 with X = 2: a final of 6, the two 3rd places are the lucky losers.
    t = run(t, { type: 'generateRound', seed: 2 });
    const final = t.rounds[1].heats[0];
    const winner = t.rounds[0].heats[0].playerIds[0];
    const order = [winner, ...final.playerIds.filter((id) => id !== winner)];
    t = run(t, { type: 'saveResult', heatId: final.id, result: { mode: 'ranking', order } });
    const marks = playerMarks(t);
    expect(marks.get(winner)).toEqual(['crown', 'flames']);
    const clovers = [...marks.entries()].filter(([, m]) => m.includes('clover'));
    expect(clovers).toHaveLength(2);
    // A heat winner who then lost has no flames.
    const other = t.rounds[0].heats[1].playerIds[0];
    expect(marks.get(other) ?? []).not.toContain('flames');
  });
});

describe('[REQ-UI-029] controllers', () => {
  const heat = (ids: string[], seats?: Record<string, number>): Heat => ({ id: 'h', playerIds: ids, seats });

  it('[REQ-UI-029] without stored numbers the line-up order is the controller order', () => {
    expect([...seatsOf(heat(['a', 'b', 'c']))]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('[REQ-UI-029] leaving frees a number, nobody else moves; a late joiner gets the lowest free number', () => {
    let h = seatRemove(heat(['a', 'b', 'c', 'd']), ['b']);
    expect(Object.fromEntries(seatsOf(h))).toEqual({ a: 1, c: 3, d: 4 });
    h = seatAdd(h, 'e');
    expect(Object.fromEntries(seatsOf(h))).toEqual({ a: 1, c: 3, d: 4, e: 2 });
    expect(bySeat(h)).toEqual(['a', 'e', 'c', 'd']);
    h = seatAdd(h, 'f');
    expect(seatsOf(h).get('f')).toBe(5);
  });

  it('[REQ-UI-029] through the engine: withdraw, late join and move keep the other numbers', () => {
    let t = setup(Array.from({ length: 14 }, (_, i) => `P${i + 1}`), { format: 'classic', heatSize: 8 });
    t = run(t, { type: 'generateRound', seed: 1 });
    const h0 = t.rounds[0].heats[0];
    const before = seatsOf(h0);
    const leaver = h0.playerIds[2];
    t = run(t, { type: 'withdraw', id: leaver });
    const after = seatsOf(t.rounds[0].heats[0]);
    for (const [id, s] of after) expect(s).toBe(before.get(id));
    expect([...after.values()]).not.toContain(before.get(leaver));
    const add = applyCommand(t, { type: 'addPlayer', player: { name: 'Late', status: 'checked-in' } }, ctx);
    if (!add.ok) throw new Error();
    const slot = lateJoinSlots(add.t).find((x) => x.id === h0.id)!;
    t = run(add.t, { type: 'lateJoin', playerId: add.playerId!, heatId: slot.id });
    expect(seatsOf(t.rounds[0].heats[0]).get(add.playerId!)).toBe(before.get(leaver));
  });
});

describe('[REQ-DATA-024] version 1 avatars and favourites', () => {
  it('[REQ-DATA-024] stay in the data unchanged and are not required', () => {
    const fx = JSON.parse(readFileSync(new URL('../store/fixtures/v1-tournaments.json', import.meta.url), 'utf8'));
    const m = migrateTournament(fx[0].done);
    if (!m.ok) throw new Error();
    expect(m.repairs).toEqual([]);
    expect(m.t.players.map((p) => [p.avatar, p.favorite])).toEqual(fx[0].done.players.map((p: { avatar: string; favorite: string }) => [p.avatar, p.favorite]));
    const t = setup(['Ann']);
    const fresh = migrateTournament(JSON.parse(JSON.stringify(t)));
    expect(fresh.ok && fresh.repairs).toEqual([]);
  });
});
