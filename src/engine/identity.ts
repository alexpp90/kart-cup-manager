// How a player is recognised without a game character: their name, gamer tag
// and a colour badge with initials, plus marks earned during the night.
// Pure functions of the tournament.
export { pickColor } from './color';
import { scoreHeat } from './points';
import { allHeats, finalResults, isPlayed, knockoutTable, leagueTable, luckyLosers, phaseOf, standings } from './tournament';
import type { Player, Tournament } from './types';

const letters = (s: string) => Array.from(s.normalize('NFC')).filter((ch) => /\p{L}|\p{N}/u.test(ch));

/** Candidate initials for a name, best first: first letters of two words, first two letters, first + another letter. */
export function initialCandidates(name: string): string[] {
  const words = name.trim().split(/\s+/).filter((w) => letters(w).length);
  const all = letters(name);
  if (!all.length) return ['?'];
  const out: string[] = [];
  if (words.length >= 2) out.push(letters(words[0])[0] + letters(words[words.length - 1])[0]);
  if (all.length >= 2) {
    out.push(all[0] + all[1]);
    for (let i = 2; i < all.length; i++) out.push(all[0] + all[i]);
  } else out.push(all[0]);
  return [...new Set(out.map((s) => s.toLocaleUpperCase()))];
}

/**
 * Initials for every player, unique where the names allow it. Earlier
 * sign-ups keep theirs, so a new player never changes somebody's badge.
 */
export function initialsMap(players: Pick<Player, 'id' | 'name' | 'createdAt'>[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  const ordered = players.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const p of ordered) {
    const cands = initialCandidates(p.name);
    const pick = cands.find((c) => !used.has(c)) ?? cands[0];
    used.add(pick);
    out.set(p.id, pick);
  }
  return out;
}

/** Initials a new name would get next to the existing players. */
export function initialsForNew(players: Pick<Player, 'id' | 'name' | 'createdAt'>[], name: string): string {
  const used = new Set(initialsMap(players).values());
  const cands = initialCandidates(name);
  return cands.find((c) => !used.has(c)) ?? cands[0];
}

/** Black or white text on a badge colour, whichever contrasts more (WCAG relative luminance). */
export function badgeTextColor(hex: string): '#14213D' | '#FFFFFF' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const navyL = 0.0152; // #14213D
  const onWhite = (1.05) / (L + 0.05);
  const onNavy = (L + 0.05) / (navyL + 0.05);
  return onNavy >= onWhite ? '#14213D' : '#FFFFFF';
}

export type Mark = 'crown' | 'flames' | 'clover';

/**
 * Marks earned during the night:
 * crown = the leader (champion once decided), flames = won the last 2+ heats
 * they raced, clover = got into a knockout round as a lucky loser.
 */
export function playerMarks(t: Tournament): Map<string, Mark[]> {
  const marks = new Map<string, Mark[]>();
  const add = (id: string, m: Mark) => marks.set(id, [...(marks.get(id) ?? []), m]);

  const leader = (): string | null => {
    const fr = finalResults(t);
    if (fr?.length) return fr[0].playerId;
    if (phaseOf(t) === 'registration') return null;
    if (t.settings.format === 'league') {
      const rows = leagueTable(t).filter((r) => r.cups > 0 && !r.withdrawn);
      return rows.length && rows.filter((r) => r.rank === 1).length === 1 ? rows[0].playerId : null;
    }
    if (t.settings.format === 'knockout') return knockoutTable(t).find((r) => r.status === 'champion')?.playerId ?? null;
    const rows = standings(t).filter((r) => r.heats > 0 && !r.withdrawn);
    return rows.length && rows.filter((r) => r.rank === 1).length === 1 ? rows[0].playerId : null;
  };
  const lead = leader();
  if (lead) add(lead, 'crown');

  // Heats in the order they were raced (first save).
  const raced = allHeats(t)
    .filter(isPlayed)
    .slice()
    .sort((a, b) => (a.finishedAt ?? a.savedAt ?? 0) - (b.finishedAt ?? b.savedAt ?? 0));
  const places = new Map<string, number[]>();
  for (const h of raced) {
    for (const s of scoreHeat(h, t.settings.points, t.settings.racesPerHeat) ?? []) places.set(s.playerId, [...(places.get(s.playerId) ?? []), s.place]);
  }
  for (const [id, ps] of places) {
    let streak = 0;
    for (let i = ps.length - 1; i >= 0 && ps[i] === 1; i--) streak++;
    if (streak >= 2) add(id, 'flames');
  }
  for (const id of luckyLosers(t)) add(id, 'clover');
  return marks;
}
