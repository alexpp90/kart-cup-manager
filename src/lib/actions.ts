import { standingsCsv } from '../engine/csv';
import { buildDemo } from '../engine/demo';
import { finalResults, standings } from '../engine/tournament';
import type { Tournament } from '../engine/types';
import { newId, tNow, useApp } from '../store/store';
import { confirmDialog, toast } from '../store/ui';
import { downloadText, pickFile, slug } from './files';

const APP = 'kart-cup-manager';

export function exportBackup() {
  const t = useApp.getState().t;
  if (!t) return;
  const data = { app: APP, version: 1, exportedAt: new Date().toISOString(), tournament: t };
  downloadText(`${slug(t.settings.name)}-${t.settings.date}-backup.json`, JSON.stringify(data, null, 2), 'application/json');
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
  downloadText(`${slug(t.settings.name)}-standings.csv`, withFinal, 'text/csv;charset=utf-8');
}

export function parseBackup(text: string): Tournament | null {
  try {
    const data = JSON.parse(text);
    const t = data?.app === APP ? data.tournament : data;
    if (!t || t.version !== 1 || !Array.isArray(t.players) || !Array.isArray(t.rounds) || typeof t.settings !== 'object') return null;
    return t as Tournament;
  } catch {
    return null;
  }
}

export async function importBackup(): Promise<boolean> {
  const text = await pickFile('application/json,.json');
  if (!text) return false;
  const t = parseBackup(text);
  if (!t) {
    toast(tNow('settings.importError'), 'error');
    return false;
  }
  if (useApp.getState().t && !(await confirmDialog({ title: tNow('settings.import'), body: tNow('settings.importConfirm', { name: t.settings.name }), danger: true }))) return false;
  useApp.getState().replace(tNow('action.import'), t);
  // An imported file is by definition backed up.
  useApp.getState().markExported();
  toast(tNow('settings.imported'), 'success');
  return true;
}

export async function loadDemo(): Promise<boolean> {
  if (useApp.getState().t && !(await confirmDialog({ title: tNow('settings.demo'), body: tNow('settings.demoConfirm'), danger: true }))) return false;
  useApp.getState().replace(tNow('action.demo'), buildDemo(newId, Date.now()));
  return true;
}
