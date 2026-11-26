import { standingsCsv, tableCsv } from '../engine/csv';
import { buildDemo } from '../engine/demo';
import { finalResults, knockoutTable, leagueTable, standings } from '../engine/tournament';
import { newId, tNow, useApp } from '../store/store';
import { confirmDialog, toast } from '../store/ui';
import { backupFileName, backupPayload, csvFileName, parseBackup, type BackupParse } from '../store/persist';
import { downloadText, pickFile } from './files';

export function exportBackup() {
  const t = useApp.getState().t;
  if (!t) return;
  downloadText(backupFileName(t.settings), JSON.stringify(backupPayload(t, new Date()), null, 2), 'application/json');
  useApp.getState().markExported();
  toast(tNow('toast.exported'), 'success');
}

export function exportCsv() {
  const t = useApp.getState().t;
  if (!t) return;
  const name = (id: string) => t.players.find((p) => p.id === id);
  const status = (id: string) => tNow(`players.status.${name(id)?.status ?? 'active'}`);
  if (t.settings.format === 'knockout') {
    const rounds = t.rounds.map((_, i) => tNow('csv.roundN', { n: i + 1 }));
    const headers = [...tNow('csv.koHeaders').split(','), ...rounds.flatMap((r) => [`${r} ${tNow('csv.place')}`, `${r} ${tNow('csv.points')}`])];
    const rows = knockoutTable(t).map((r) => [
      r.position,
      name(r.playerId)?.name ?? '?',
      name(r.playerId)?.tag ?? '',
      r.reached + 1,
      r.lucky ? tNow('common.yes') : tNow('common.no'),
      status(r.playerId),
      ...r.cells.flatMap((c) => [c?.place ?? '', c?.points ?? '']),
    ]);
    downloadText(csvFileName(t.settings), tableCsv(headers, rows), 'text/csv;charset=utf-8');
    return;
  }
  if (t.settings.format === 'league') {
    const cups = Math.max(t.settings.leagueCups, t.rounds.length);
    const headers = [...tNow('csv.leagueHeaders').split(','), ...Array.from({ length: cups }, (_, i) => tNow('league.cupShort', { n: i + 1 }))];
    const rows = leagueTable(t)
      .filter((r) => r.cups > 0)
      .map((r) => [r.rank, name(r.playerId)?.name ?? '?', name(r.playerId)?.tag ?? '', r.cups, r.total, r.wins, status(r.playerId), ...r.perCup.map((v) => v ?? '')]);
    downloadText(csvFileName(t.settings), tableCsv(headers, rows), 'text/csv;charset=utf-8');
    return;
  }
  const fr = finalResults(t);
  const places = fr ? new Map(fr.map((r) => [r.playerId, r.place])) : undefined;
  const headers = tNow('csv.headers').split(',');
  const csv = standingsCsv(standings(t), t.players, {
    headers: places ? headers : headers,
    yes: tNow('common.yes'),
    no: tNow('common.no'),
    withdrawn: tNow('players.status.withdrawn'),
    active: tNow('players.status.active'),
  }, places);
  const withFinal = places ? csv.replace(/^﻿final,/, `﻿${tNow('csv.final')},`) : csv;
  downloadText(csvFileName(t.settings), withFinal, 'text/csv;charset=utf-8');
}

export function importErrorText(r: Extract<BackupParse, { ok: false }>): string {
  return r.error === 'newer' ? tNow('settings.importNewer', { version: r.version ?? '?' }) : tNow('settings.importError');
}

export async function importBackup(): Promise<boolean> {
  const text = await pickFile('application/json,.json');
  if (!text) return false;
  const r = parseBackup(text);
  if (!r.ok) {
    toast(importErrorText(r), 'error');
    return false;
  }
  const t = r.t;
  if (useApp.getState().t && !(await confirmDialog({ title: tNow('settings.import'), body: tNow('settings.importConfirm', { name: t.settings.name }), danger: true }))) return false;
  useApp.getState().replace(tNow('action.import'), t);
  // An imported file is by definition backed up.
  useApp.getState().markExported();
  toast(tNow('settings.imported'), 'success');
  if (r.repairs.length) toast(tNow('data.repaired', { n: r.repairs.length }));
  return true;
}

export async function loadDemo(): Promise<boolean> {
  if (useApp.getState().t && !(await confirmDialog({ title: tNow('settings.demo'), body: tNow('settings.demoConfirm'), danger: true }))) return false;
  useApp.getState().replace(tNow('action.demo'), buildDemo(newId, Date.now()));
  return true;
}
