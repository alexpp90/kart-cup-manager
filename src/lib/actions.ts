import { standingsCsv } from '../engine/csv';
import { buildDemo } from '../engine/demo';
import { finalResults, standings } from '../engine/tournament';
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
