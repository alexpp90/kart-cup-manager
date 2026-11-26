import type { StandingRow } from './ranking';
import type { Player } from './types';

const esc = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CsvLabels {
  headers: string[]; // rank, name, tag, heats, total, avg, wins, best, eligible, status
  yes: string;
  no: string;
  withdrawn: string;
  active: string;
}

export function standingsCsv(rows: StandingRow[], players: Player[], labels: CsvLabels, finalPlaces?: Map<string, number>): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const head = finalPlaces ? ['final', ...labels.headers] : labels.headers;
  const lines = [head.map(esc).join(',')];
  const ordered = finalPlaces ? rows.slice().sort((a, b) => (finalPlaces.get(a.playerId) ?? 999) - (finalPlaces.get(b.playerId) ?? 999)) : rows;
  for (const r of ordered) {
    const p = byId.get(r.playerId);
    const cells: (string | number)[] = [
      r.rank,
      p?.name ?? '?',
      p?.tag ?? '',
      r.heats,
      r.total,
      r.avg.toFixed(2),
      r.wins,
      r.best,
      r.eligible ? labels.yes : labels.no,
      r.withdrawn ? labels.withdrawn : labels.active,
    ];
    lines.push((finalPlaces ? [finalPlaces.get(r.playerId) ?? '', ...cells] : cells).map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Any table as CSV with the same conventions (BOM, commas, CRLF, escaping). */
export function tableCsv(headers: string[], rows: (string | number)[][]): string {
  return '\ufeff' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
