// Persistence without React: schema versions, repair of missing fields, the
// stored envelope, backups and storage writes. Pure or storage-injected so it
// can be unit tested in node.
import { defaultSettings } from '../engine/tournament';
import type { Settings, Tournament } from '../engine/types';

export const APP = 'kart-cup-manager';
export const STORAGE_KEY = 'kart-cup-manager:v1';
export const PREFS_KEY = 'kart-cup-manager:prefs';
/** A copy of unreadable stored data is kept here before anything else is written. */
export const CORRUPT_KEY = 'kart-cup-manager:v1:corrupt';
export const DRAFT_PREFIX = 'kart-cup-manager:draft:';
export const HISTORY_LIMIT = 30;
/** Highest tournament schema this build understands. */
export const CURRENT_VERSION = 1;

export interface Snapshot {
  label: string;
  t: Tournament | null;
}

/**
 * What lives under STORAGE_KEY. `changeSeq` counts changes and `exportSeq` is
 * the changeSeq at the last export/import, so "unsaved changes" never depends
 * on the system clock. `changeSeq` also orders writes between two windows.
 */
export interface Persisted {
  t: Tournament | null;
  history: Snapshot[];
  changeSeq: number;
  exportSeq: number;
  /** Wall-clock time of the last export, for display only. */
  lastExportAt: number;
}

export const emptyPersisted = (): Persisted => ({ t: null, history: [], changeSeq: 0, exportSeq: 0, lastExportAt: 0 });

// ------------------------------------------------------------- migration + repair

export type MigrateResult =
  | { ok: true; t: Tournament; repairs: string[] }
  | { ok: false; error: 'invalid' | 'newer'; version?: number };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Fill a missing or wrongly typed field with its default and note the repair. */
function fix<T>(obj: Record<string, unknown>, key: string, ok: (v: unknown) => boolean, def: T, repairs: string[], where: string): void {
  if (!ok(obj[key])) {
    obj[key] = def;
    repairs.push(`${where}${key}`);
  }
}

/**
 * Bring a stored or imported tournament to the current schema.
 * Unversioned data is treated as version 1. Data from a newer app is rejected.
 * Missing simple fields are filled with defaults (and listed in `repairs`);
 * broken structure (players/rounds not lists, players without id or name,
 * heats without player lists) is rejected as invalid.
 */
export function migrateTournament(raw: unknown): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: 'invalid' };
  const t = structuredClone(raw) as Record<string, unknown>;
  const repairs: string[] = [];
  if (t.version === undefined) {
    t.version = 1;
    repairs.push('version');
  }
  if (!isNum(t.version) || !Number.isInteger(t.version) || t.version < 1) return { ok: false, error: 'invalid' };
  if (t.version > CURRENT_VERSION) return { ok: false, error: 'newer', version: t.version };
  if (!Array.isArray(t.players) || !Array.isArray(t.rounds)) return { ok: false, error: 'invalid' };

  if (!isObj(t.settings)) {
    t.settings = {};
    repairs.push('settings');
  }
  const s = t.settings as Record<string, unknown>;
  const defaults = defaultSettings() as unknown as Record<string, unknown>;
  for (const [key, def] of Object.entries(defaults)) {
    const sameType = (v: unknown) => (Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def);
    fix(s, key, sameType, structuredClone(def), repairs, 'settings.');
  }
  if (s.maxPerHeat !== 4 && s.maxPerHeat !== 8) {
    s.maxPerHeat = 8;
    repairs.push('settings.maxPerHeat');
  }

  for (let i = 0; i < t.players.length; i++) {
    const p = t.players[i];
    if (!isObj(p) || !isStr(p.id) || !p.id || !isStr(p.name) || !p.name.trim()) return { ok: false, error: 'invalid' };
    const w = `players[${i}].`;
    fix(p, 'tag', isStr, '', repairs, w);
    fix(p, 'avatar', isStr, 'fox', repairs, w);
    fix(p, 'color', isStr, '#E60012', repairs, w);
    fix(p, 'favorite', isStr, '', repairs, w);
    fix(p, 'status', (v) => v === 'registered' || v === 'checked-in' || v === 'active' || v === 'withdrawn', 'checked-in', repairs, w);
    fix(p, 'createdAt', isNum, 0, repairs, w);
    fix(p, 'joinedRound', isNum, 0, repairs, w);
  }

  const checkHeat = (h: unknown): h is Record<string, unknown> => isObj(h) && isStr(h.id) && Array.isArray(h.playerIds) && h.playerIds.every(isStr);
  for (let i = 0; i < t.rounds.length; i++) {
    const r = t.rounds[i];
    if (!isObj(r) || !Array.isArray(r.heats) || !r.heats.every(checkHeat)) return { ok: false, error: 'invalid' };
    const w = `rounds[${i}].`;
    fix(r, 'id', isStr, `round-${i}`, repairs, w);
    fix(r, 'index', isNum, i, repairs, w);
    fix(r, 'createdAt', isNum, 0, repairs, w);
    fix(r, 'byes', Array.isArray, [], repairs, w);
  }

  if (t.finals !== null && t.finals !== undefined) {
    const f = t.finals;
    if (!isObj(f) || !Array.isArray(f.stages)) return { ok: false, error: 'invalid' };
    for (const st of f.stages) {
      if (!isObj(st) || !isObj(st.config) || !Array.isArray(st.seeds) || !Array.isArray(st.heats) || !st.heats.every(checkHeat)) return { ok: false, error: 'invalid' };
      if (st.lastChance !== undefined && !checkHeat(st.lastChance)) return { ok: false, error: 'invalid' };
    }
    fix(f, 'qualifyingOrder', Array.isArray, [], repairs, 'finals.');
    fix(f, 'startedAt', isNum, 0, repairs, 'finals.');
  }
  fix(t, 'finals', (v) => v === null || isObj(v), null, repairs, '');
  fix(t, 'suddenDeath', Array.isArray, [], repairs, '');
  fix(t, 'id', (v) => isStr(v) && v.length > 0, 'repaired', repairs, '');
  fix(t, 'createdAt', isNum, 0, repairs, '');
  fix(t, 'rngCounter', isNum, 0, repairs, '');
  return { ok: true, t: t as unknown as Tournament, repairs };
}

// ------------------------------------------------------------- stored envelope

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; data: Persisted; repairs: string[] }
  | { kind: 'corrupt'; raw: string; reason: 'json' | 'invalid' | 'newer' };

/** Read what is stored under STORAGE_KEY. Never throws and never discards: unreadable data is reported as corrupt. */
export function parsePersisted(raw: string | null): LoadResult {
  if (raw === null || raw === '') return { kind: 'empty' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw, reason: 'json' };
  }
  if (!isObj(data)) return { kind: 'corrupt', raw, reason: 'invalid' };
  // A bare tournament (no envelope) is accepted as well.
  const env = 'history' in data || 't' in data ? data : { t: data, history: [] };
  let t: Tournament | null = null;
  let repairs: string[] = [];
  if (env.t !== null && env.t !== undefined) {
    const m = migrateTournament(env.t);
    if (!m.ok) return { kind: 'corrupt', raw, reason: m.error };
    t = m.t;
    repairs = m.repairs;
  }
  // Snapshots that cannot be read any more are dropped; they only feed undo.
  const history: Snapshot[] = [];
  if (Array.isArray(env.history)) {
    for (const h of env.history) {
      if (!isObj(h) || !isStr(h.label)) continue;
      if (h.t === null) history.push({ label: h.label, t: null });
      else {
        const m = migrateTournament(h.t);
        if (m.ok) history.push({ label: h.label, t: m.t });
      }
    }
  }
  let changeSeq = isNum(env.changeSeq) ? env.changeSeq : 0;
  let exportSeq = isNum(env.exportSeq) ? env.exportSeq : 0;
  // Version-1 envelopes compared wall-clock times; keep their "unsaved" flag.
  if (!isNum(env.changeSeq) && isNum(env.lastChangeAt)) {
    const dirty = env.lastChangeAt > (isNum(env.lastExportAt) ? env.lastExportAt : 0);
    changeSeq = dirty ? 1 : 0;
    exportSeq = 0;
  }
  return {
    kind: 'ok',
    data: { t, history: history.slice(-HISTORY_LIMIT), changeSeq, exportSeq, lastExportAt: isNum(env.lastExportAt) ? env.lastExportAt : 0 },
    repairs,
  };
}

// ------------------------------------------------------------- storage writes

/** The subset of the Web Storage API we use; lets tests inject a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** True when the storage accepts a write (false in some private modes or when blocked). */
export function storageWorks(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem('kart-cup-manager:probe', '1');
    storage.removeItem('kart-cup-manager:probe');
    return true;
  } catch {
    return false;
  }
}

export type SaveResult = { ok: true; history: Snapshot[]; trimmed: boolean } | { ok: false };

/**
 * Save the envelope. If the storage is full, the oldest undo snapshots are
 * dropped first (half at a time). If even the bare tournament does not fit,
 * nothing is written, so the previously stored data stays intact.
 */
export function saveEnvelope(storage: StorageLike, p: Persisted): SaveResult {
  let history = p.history;
  for (;;) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...p, history }));
      return { ok: true, history, trimmed: history !== p.history };
    } catch {
      if (!history.length) return { ok: false };
      history = history.slice(Math.ceil(history.length / 2));
    }
  }
}

// ------------------------------------------------------------- backups

export interface BackupFile {
  app: typeof APP;
  version: number;
  exportedAt: string;
  tournament: Tournament;
}

export function backupPayload(t: Tournament, now: Date): BackupFile {
  return { app: APP, version: t.version, exportedAt: now.toISOString(), tournament: t };
}

export type BackupParse =
  | { ok: true; t: Tournament; repairs: string[] }
  | { ok: false; error: 'json' | 'foreign' | 'invalid' | 'newer'; version?: number };

/** Read a backup file: our envelope or a bare tournament. Anything else is rejected without side effects. */
export function parseBackup(text: string): BackupParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!isObj(data)) return { ok: false, error: 'foreign' };
  let raw: unknown;
  if ('app' in data) {
    if (data.app !== APP) return { ok: false, error: 'foreign' };
    raw = data.tournament;
  } else if ('players' in data && 'rounds' in data) raw = data;
  else return { ok: false, error: 'foreign' };
  const m = migrateTournament(raw);
  return m.ok ? m : { ok: false, error: m.error, version: m.version };
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'tournament';
}

export const backupFileName = (s: Pick<Settings, 'name' | 'date'>) => `${slug(s.name)}-${s.date}-backup.json`;
export const csvFileName = (s: Pick<Settings, 'name'>) => `${slug(s.name)}-standings.csv`;
