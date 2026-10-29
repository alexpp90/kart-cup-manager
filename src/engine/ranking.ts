import type { HeatScore, Player, SuddenDeath } from './types';

export interface ScoredHeat {
  heatId: string;
  scores: HeatScore[];
}

export type TiebreakKind = 'wins' | 'best' | 'h2h' | 'sudden' | 'unresolved';

export interface Tiebreak {
  kind: TiebreakKind;
  /** The player on the other side of the tie. */
  other: string;
  mine: number;
  theirs: number;
}

export interface StandingRow {
  playerId: string;
  /** Unique 1-based position. */
  position: number;
  /** Display rank: equal for players whose tie is still unresolved. */
  rank: number;
  heats: number;
  total: number;
  avg: number;
  wins: number;
  best: number;
  eligible: boolean;
  withdrawn: boolean;
  /** How this row was separated from the row directly above / below it (only when averages are equal). */
  tieAbove?: Tiebreak;
  tieBelow?: Tiebreak;
}

export function minHeatsForFinals(qualRounds: number): number {
  return Math.ceil(qualRounds / 2);
}

export function suddenDeathKey(ids: string[]): string {
  return ids.slice().sort().join(',');
}

interface Agg {
  id: string;
  heats: number;
  total: number;
  wins: number;
  best: number;
}

/**
 * Qualifying standings. Ranked by average points per heat played, then
 * total heat wins → best single-heat result → head-to-head → sudden death.
 */
export function computeStandings(
  players: Player[],
  heats: ScoredHeat[],
  qualRounds: number,
  suddenDeath: SuddenDeath[] = [],
): StandingRow[] {
  const agg = new Map<string, Agg>();
  for (const p of players) agg.set(p.id, { id: p.id, heats: 0, total: 0, wins: 0, best: 0 });
  for (const h of heats) {
    for (const s of h.scores) {
      const a = agg.get(s.playerId);
      if (!a) continue;
      a.heats++;
      a.total += s.points;
      if (s.place === 1) a.wins++;
      a.best = Math.max(a.best, s.points);
    }
  }
  const h2h = (a: string, b: string): [number, number] => {
    let wa = 0;
    let wb = 0;
    for (const h of heats) {
      const sa = h.scores.find((s) => s.playerId === a);
      const sb = h.scores.find((s) => s.playerId === b);
      if (!sa || !sb) continue;
      if (sa.place < sb.place) wa++;
      else wb++;
    }
    return [wa, wb];
  };

  const status = new Map(players.map((p) => [p.id, p.status]));
  const nameOf = new Map(players.map((p) => [p.id, p.name.toLowerCase()]));
  const list = [...agg.values()];
  // Compare averages exactly with cross-multiplication (no float drift).
  const cmpAvg = (a: Agg, b: Agg) => {
    if (a.heats === 0 || b.heats === 0) return (b.heats > 0 ? 1 : 0) - (a.heats > 0 ? 1 : 0);
    return b.total * a.heats - a.total * b.heats;
  };
  const cmpStats = (a: Agg, b: Agg) => cmpAvg(a, b) || b.wins - a.wins || b.best - a.best;
  list.sort((a, b) => cmpStats(a, b) || (nameOf.get(a.id)! < nameOf.get(b.id)! ? -1 : 1));

  // Resolve groups that are still level with head-to-head and sudden death.
  const ordered: Agg[] = [];
  const unresolvedGroupOf = new Map<string, string>();
  const reasonBetween = new Map<string, Tiebreak>(); // key `${above}>${below}`
  let i = 0;
  while (i < list.length) {
    let j = i + 1;
    while (j < list.length && cmpStats(list[i], list[j]) === 0 && list[i].heats > 0) j++;
    const group = list.slice(i, j);
    if (group.length === 1) {
      ordered.push(group[0]);
    } else {
      ordered.push(...resolveGroup(group, h2h, suddenDeath, unresolvedGroupOf, reasonBetween));
    }
    i = j;
  }

  const rows: StandingRow[] = [];
  const minHeats = minHeatsForFinals(qualRounds);
  ordered.forEach((a, idx) => {
    const prev = ordered[idx - 1];
    const sameUnresolved = prev && unresolvedGroupOf.has(a.id) && unresolvedGroupOf.get(a.id) === unresolvedGroupOf.get(prev.id);
    const withdrawn = status.get(a.id) === 'withdrawn';
    rows.push({
      playerId: a.id,
      position: idx + 1,
      rank: sameUnresolved ? rows[idx - 1].rank : idx + 1,
      heats: a.heats,
      total: a.total,
      avg: a.heats ? a.total / a.heats : 0,
      wins: a.wins,
      best: a.best,
      eligible: !withdrawn && a.heats >= minHeats,
      withdrawn,
    });
  });
  // Attach tooltip reasons between neighbours with equal averages.
  for (let k = 1; k < ordered.length; k++) {
    const above = ordered[k - 1];
    const below = ordered[k];
    if (above.heats === 0 || cmpAvg(above, below) !== 0) continue;
    let reason: Tiebreak;
    if (above.wins !== below.wins) reason = { kind: 'wins', other: below.id, mine: above.wins, theirs: below.wins };
    else if (above.best !== below.best) reason = { kind: 'best', other: below.id, mine: above.best, theirs: below.best };
    else reason = reasonBetween.get(`${above.id}>${below.id}`) ?? { kind: 'unresolved', other: below.id, mine: 0, theirs: 0 };
    rows[k - 1].tieBelow = reason;
    rows[k].tieAbove = { ...reason, other: above.id, mine: reason.theirs, theirs: reason.mine };
  }
  return rows;
}

function resolveGroup(
  group: Agg[],
  h2h: (a: string, b: string) => [number, number],
  suddenDeath: SuddenDeath[],
  unresolvedGroupOf: Map<string, string>,
  reasonBetween: Map<string, Tiebreak>,
): Agg[] {
  // Head-to-head mini league among the tied players (only heats where they met).
  const net = new Map<string, number>();
  for (const a of group) {
    let n = 0;
    for (const b of group) {
      if (a === b) continue;
      const [wa, wb] = h2h(a.id, b.id);
      n += wa - wb;
    }
    net.set(a.id, n);
  }
  const sorted = group.slice().sort((a, b) => net.get(b.id)! - net.get(a.id)!);
  const result: Agg[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && net.get(sorted[j].id) === net.get(sorted[i].id)) j++;
    let sub = sorted.slice(i, j);
    if (sub.length > 1) {
      const key = suddenDeathKey(sub.map((s) => s.id));
      const sd = suddenDeath.find((s) => s.key === key);
      if (sd) {
        sub = sd.order.map((id) => sub.find((s) => s.id === id)!).filter(Boolean);
        for (let k = 1; k < sub.length; k++) {
          reasonBetween.set(`${sub[k - 1].id}>${sub[k].id}`, { kind: 'sudden', other: sub[k].id, mine: 1, theirs: 0 });
        }
      } else {
        for (const s of sub) unresolvedGroupOf.set(s.id, key);
      }
    }
    result.push(...sub);
    i = j;
  }
  // Reasons for neighbours separated by head-to-head.
  for (let k = 1; k < result.length; k++) {
    const a = result[k - 1];
    const b = result[k];
    if (net.get(a.id) !== net.get(b.id)) {
      const [wa, wb] = h2h(a.id, b.id);
      const pairwise = wa + wb > 0;
      reasonBetween.set(`${a.id}>${b.id}`, {
        kind: 'h2h',
        other: b.id,
        mine: pairwise ? wa : net.get(a.id)!,
        theirs: pairwise ? wb : net.get(b.id)!,
      });
    }
  }
  return result;
}

/**
 * Find an unresolved tie that straddles a cut (between position `cut` and `cut + 1`
 * among the rows passed in). Returns the full tied group or null.
 */
export function tieAcrossCut(rows: StandingRow[], cut: number): string[] | null {
  if (cut <= 0 || cut >= rows.length) return null;
  const a = rows[cut - 1];
  const b = rows[cut];
  if (a.rank !== b.rank) return null;
  return rows.filter((r) => r.rank === a.rank).map((r) => r.playerId);
}
