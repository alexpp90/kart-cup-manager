// League: everyone fits into one heat, so every cup is raced by the whole field.
// The total decides; ties go to more cup wins, then more 2nd places and so on,
// then the better place in the latest cup both raced, then sudden death.
import { suddenDeathKey } from './ranking';
import type { HeatScore, Player, SuddenDeath } from './types';

export interface LeagueRow {
  playerId: string;
  /** Unique 1-based position. */
  position: number;
  /** Display rank: shared while a tie is unresolved. */
  rank: number;
  cups: number;
  total: number;
  wins: number;
  /** Points per cup, null where the player did not race. */
  perCup: (number | null)[];
  /** Joined after the first cup. */
  lateStart: boolean;
  withdrawn: boolean;
}

/** `cups[i]` = scores of cup i (null when not raced yet). */
export function leagueStandings(players: Player[], cups: (HeatScore[] | null)[], suddenDeath: SuddenDeath[]): LeagueRow[] {
  const played = cups.filter((c): c is HeatScore[] => !!c);
  const placeIn = (id: string, c: HeatScore[]) => c.find((s) => s.playerId === id)?.place;
  const rows = players
    .filter((p) => p.status !== 'registered' || played.some((c) => placeIn(p.id, c)))
    .map((p) => {
      const perCup = cups.map((c) => (c ? (c.find((s) => s.playerId === p.id)?.points ?? null) : null));
      const placeCounts = Array.from({ length: 9 }, () => 0);
      for (const c of played) {
        const pl = placeIn(p.id, c);
        if (pl) placeCounts[Math.min(pl, 8)]++;
      }
      const firstCup = cups.findIndex((c) => c && placeIn(p.id, c));
      return {
        id: p.id,
        name: p.name.toLowerCase(),
        perCup,
        placeCounts,
        total: perCup.reduce<number>((a, v) => a + (v ?? 0), 0),
        cups: perCup.filter((v) => v !== null).length,
        lateStart: firstCup > 0 || (firstCup === -1 && played.length > 0),
        withdrawn: p.status === 'withdrawn',
      };
    });
  type R = (typeof rows)[number];
  const cmpStats = (a: R, b: R): number => {
    if (b.total !== a.total) return b.total - a.total;
    for (let place = 1; place <= 8; place++) if (a.placeCounts[place] !== b.placeCounts[place]) return b.placeCounts[place] - a.placeCounts[place];
    for (let i = cups.length - 1; i >= 0; i--) {
      const c = cups[i];
      if (!c) continue;
      const pa = placeIn(a.id, c);
      const pb = placeIn(b.id, c);
      if (pa && pb && pa !== pb) return pa - pb;
    }
    return 0;
  };
  // Withdrawn players keep their points but are listed after everyone still racing.
  const cmp = (a: R, b: R) => Number(a.withdrawn) - Number(b.withdrawn) || cmpStats(a, b);
  rows.sort((a, b) => cmp(a, b) || (a.name < b.name ? -1 : 1));
  const out: LeagueRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && cmp(rows[i], rows[j]) === 0 && rows[i].cups > 0) j++;
    let group = rows.slice(i, j);
    let shared = false;
    if (group.length > 1) {
      const sd = suddenDeath.find((s) => s.key === suddenDeathKey(group.map((g) => g.id)));
      if (sd) group = sd.order.map((id) => group.find((g) => g.id === id)!).filter(Boolean);
      else shared = true;
    }
    group.forEach((g, k) =>
      out.push({
        playerId: g.id,
        position: i + k + 1,
        rank: shared ? i + 1 : i + k + 1,
        cups: g.cups,
        total: g.total,
        wins: g.placeCounts[1],
        perCup: g.perCup,
        lateStart: g.lateStart,
        withdrawn: g.withdrawn,
      }),
    );
    i = j;
  }
  return out;
}

/** An unresolved tie that touches the podium (ranks 1–3), or null. */
export function leaguePodiumTie(rows: LeagueRow[]): string[] | null {
  const active = rows.filter((r) => !r.withdrawn && r.cups > 0);
  for (const r of active) {
    if (r.rank > 3) break;
    const group = active.filter((x) => x.rank === r.rank);
    if (group.length > 1) return group.map((g) => g.playerId);
  }
  return null;
}
