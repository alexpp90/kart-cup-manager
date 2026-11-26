// Persistence rules: autosave, storage failures, recovery, schema versions,
// backups, undo and change tracking. The store module reads storage when it is
// imported, so each test stubs the globals and imports a fresh copy.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDemo } from '../engine/demo';
import { readFileSync } from 'node:fs';
import { addPlayer, createTournament, defaultSettings, finalResults, standings } from '../engine/tournament';
import type { Tournament } from '../engine/types';
import {
  backupFileName, backupPayload, CORRUPT_KEY, csvFileName, CURRENT_VERSION, migrateTournament, parseBackup, parsePersisted,
  PREFS_KEY, saveEnvelope, STORAGE_KEY, type Persisted,
} from './persist';

class FakeStorage {
  data = new Map<string, string>();
  quota = Infinity;
  broken = false;
  writes = 0;
  getItem(k: string) {
    if (this.broken) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error('SecurityError');
    const size = [...this.data].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0) + k.length + v.length;
    if (size > this.quota) throw new Error('QuotaExceededError');
    this.data.set(k, v);
    this.writes++;
  }
  removeItem(k: string) {
    if (this.broken) throw new Error('SecurityError');
    this.data.delete(k);
  }
}

let ids = 0;
const newId = () => `x${++ids}`;
const demo = (): Tournament => buildDemo(newId, 0);
const small = (): Tournament => {
  let t = createTournament(defaultSettings(), 'T', 0);
  for (const name of ['Ann', 'Ben', 'Cat']) {
    const r = addPlayer(t, { name, color: '#000' }, name, 0);
    if (r.ok) t = r.t;
  }
  return t;
};

async function freshStore(storage: FakeStorage | null) {
  vi.resetModules();
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  vi.stubGlobal('localStorage', storage ?? undefined);
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] ??= []).push(fn),
    removeEventListener: () => {},
  });
  const mod = await import('./store');
  return { ...mod, fire: (type: string, e: unknown) => listeners[type]?.forEach((fn) => fn(e)) };
}

const stored = (s: FakeStorage) => parsePersisted(s.data.get(STORAGE_KEY) ?? null);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autosave', () => {
  it('[REQ-DATA-001] every change is written to localStorage immediately and survives a reload', async () => {
    const s = new FakeStorage();
    const a = await freshStore(s);
    a.startAutosave();
    a.useApp.getState().replace('create', small());
    a.useApp.getState().apply('rename', (t) => ({ ...t, settings: { ...t.settings, name: 'Renamed' } }));
    const r = stored(s);
    expect(r.kind === 'ok' && r.data.t?.settings.name).toBe('Renamed');
    const b = await freshStore(s);
    expect(b.useApp.getState().t?.settings.name).toBe('Renamed');
    expect(b.useApp.getState().history.map((h) => h.label)).toEqual(['create', 'rename']);
  });

  it('[REQ-DATA-005] storage full: oldest undo snapshots go first; if the tournament does not fit, the old data stays and a warning is raised', async () => {
    const s = new FakeStorage();
    const a = await freshStore(s);
    a.startAutosave();
    a.useApp.getState().replace('demo', demo());
    for (let i = 0; i < 6; i++) a.useApp.getState().apply(`edit ${i}`, (t) => ({ ...t, settings: { ...t.settings, name: `N${i}` } }));
    const full = s.data.get(STORAGE_KEY)!.length;
    s.quota = Math.floor(full * 0.6);
    a.useApp.getState().apply('edit 6', (t) => ({ ...t, settings: { ...t.settings, name: 'N6' } }));
    const r = stored(s);
    expect(r.kind === 'ok' && r.data.t?.settings.name).toBe('N6');
    expect(r.kind === 'ok' && r.data.history.length).toBeLessThan(7);
    expect(a.useApp.getState().storage).toBe('ok');
    // Now not even the tournament fits: nothing is overwritten.
    const before = s.data.get(STORAGE_KEY);
    s.quota = 100;
    expect(() => a.useApp.getState().apply('edit 7', (t) => ({ ...t, settings: { ...t.settings, name: 'N7' } }))).not.toThrow();
    expect(a.useApp.getState().storage).toBe('full');
    expect(s.data.get(STORAGE_KEY)).toBe(before);
    expect(a.useApp.getState().t?.settings.name).toBe('N7');
  });

  it('[REQ-DATA-006] storage that throws: the app runs in memory and reports it', async () => {
    const s = new FakeStorage();
    s.broken = true;
    const a = await freshStore(s);
    expect(a.useApp.getState().storage).toBe('unavailable');
    expect(() => a.startAutosave()).not.toThrow();
    a.useApp.getState().replace('create', small());
    expect(a.useApp.getState().t?.players).toHaveLength(3);
    const none = await freshStore(null);
    expect(none.useApp.getState().storage).toBe('unavailable');
  });

  it('[REQ-DATA-022] a failing prefs write does not block the tournament save', async () => {
    const s = new FakeStorage();
    const a = await freshStore(s);
    a.startAutosave();
    const orig = s.setItem.bind(s);
    s.setItem = (k: string, v: string) => {
      if (k === PREFS_KEY) throw new Error('nope');
      orig(k, v);
    };
    a.useApp.getState().setPrefs({ lang: 'de' });
    a.useApp.getState().replace('create', small());
    expect(stored(s).kind).toBe('ok');
  });
});

describe('recovery', () => {
  it('[REQ-DATA-007] corrupted JSON: no crash, no wipe, a copy is kept and recovery is offered', async () => {
    const s = new FakeStorage();
    s.data.set(STORAGE_KEY, '{"t": {"players": [ broken');
    const a = await freshStore(s);
    a.startAutosave();
    const st = a.useApp.getState();
    expect(st.recovery?.reason).toBe('json');
    expect(st.t).toBeNull();
    expect(s.data.get(STORAGE_KEY)).toBe('{"t": {"players": [ broken');
    expect(s.data.get(CORRUPT_KEY)).toBe('{"t": {"players": [ broken');
    st.setPrefs({ sound: true }); // unrelated writes don't touch the damaged data
    expect(s.data.get(STORAGE_KEY)).toBe('{"t": {"players": [ broken');
    st.resolveRecovery(null);
    expect(a.useApp.getState().recovery).toBeNull();
    expect(stored(s).kind).toBe('ok');
    expect(s.data.get(CORRUPT_KEY)).toBe('{"t": {"players": [ broken');
  });

  it('[REQ-DATA-007] recovery by importing a backup', async () => {
    const s = new FakeStorage();
    s.data.set(STORAGE_KEY, 'garbage');
    const a = await freshStore(s);
    a.startAutosave();
    const r = parseBackup(JSON.stringify(backupPayload(small(), new Date(0))));
    if (!r.ok) throw new Error();
    a.useApp.getState().resolveRecovery(r.t);
    const after = stored(s);
    expect(after.kind === 'ok' && after.data.t?.players.length).toBe(3);
    expect(a.useApp.getState().changeSeq).toBe(a.useApp.getState().exportSeq);
  });

  it('[REQ-DATA-008] missing fields are repaired with defaults and reported; broken structure goes to recovery', async () => {
    const t = small() as unknown as Record<string, unknown>;
    const broken = structuredClone(t) as Record<string, any>;
    delete broken.suddenDeath;
    delete broken.rngCounter;
    delete broken.settings.cupOverheadMinutes;
    delete broken.players[0].tag;
    broken.players[1].status = 'nonsense';
    const m = migrateTournament(broken);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.repairs).toEqual(expect.arrayContaining(['suddenDeath', 'rngCounter', 'settings.cupOverheadMinutes', 'players[0].tag', 'players[1].status']));
    expect(m.t.suddenDeath).toEqual([]);
    expect(m.t.settings.cupOverheadMinutes).toBe(defaultSettings().cupOverheadMinutes);
    expect(m.t.players[0].tag).toBe('');
    expect(migrateTournament({ ...t, players: 'nope' })).toEqual({ ok: false, error: 'invalid' });
    expect(migrateTournament({ ...t, players: [{ name: 'no id' }] })).toEqual({ ok: false, error: 'invalid' });
    expect(migrateTournament({ ...t, rounds: [{ heats: [{ id: 'h' }] }] })).toEqual({ ok: false, error: 'invalid' });

    const s = new FakeStorage();
    s.data.set(STORAGE_KEY, JSON.stringify({ t: broken, history: [] }));
    const a = await freshStore(s);
    expect(a.useApp.getState().repairs.length).toBeGreaterThanOrEqual(5);
    expect(a.useApp.getState().t?.players).toHaveLength(3);
    s.data.set(STORAGE_KEY, JSON.stringify({ t: { ...t, rounds: null }, history: [] }));
    const b = await freshStore(s);
    expect(b.useApp.getState().recovery?.reason).toBe('invalid');
  });

  it('[REQ-DATA-009] data carries a version; unversioned data migrates; data from a newer app is rejected', async () => {
    const t = small();
    expect(t.version).toBe(CURRENT_VERSION);
    const { version: _v, ...unversioned } = t;
    const m = migrateTournament(unversioned);
    expect(m.ok && m.t.version).toBe(CURRENT_VERSION);
    expect(m.ok && m.repairs).toContain('version');
    expect(migrateTournament({ ...t, version: CURRENT_VERSION + 1 })).toEqual({ ok: false, error: 'newer', version: CURRENT_VERSION + 1 });
    expect(parseBackup(JSON.stringify(backupPayload({ ...t, version: 99 as 2 }, new Date(0))))).toEqual({ ok: false, error: 'newer', version: 99 });
    // Old envelope with wall-clock change tracking keeps its unsaved flag.
    const old = parsePersisted(JSON.stringify({ t, history: [], lastChangeAt: 5, lastExportAt: 2 }));
    expect(old.kind === 'ok' && old.data.changeSeq > old.data.exportSeq).toBe(true);
    const s = new FakeStorage();
    s.data.set(STORAGE_KEY, JSON.stringify({ t: { ...t, version: 7 }, history: [] }));
    const a = await freshStore(s);
    expect(a.useApp.getState().recovery?.reason).toBe('newer');
  });
});

describe('backups', () => {
  it('[REQ-DATA-010] export → wipe → import is lossless', () => {
    const t = demo();
    const text = JSON.stringify(backupPayload(t, new Date(0)), null, 2);
    const r = parseBackup(text);
    expect(r.ok && r.t).toEqual(t);
    expect(r.ok && r.repairs).toEqual([]);
  });

  it('[REQ-DATA-011] invalid or foreign files are rejected', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'json' });
    expect(parseBackup('[1,2]')).toEqual({ ok: false, error: 'foreign' });
    expect(parseBackup(JSON.stringify({ app: 'other-app', tournament: small() }))).toEqual({ ok: false, error: 'foreign' });
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toEqual({ ok: false, error: 'foreign' });
    expect(parseBackup(JSON.stringify({ app: 'kart-cup-manager', tournament: { players: 3, rounds: [] } }))).toEqual({ ok: false, error: 'invalid' });
    // A bare tournament (older exports) is accepted.
    expect(parseBackup(JSON.stringify(small())).ok).toBe(true);
  });

  it('[REQ-DATA-018] backup format {app, version, exportedAt, tournament}; file names are slugged', () => {
    const t = small();
    const b = backupPayload(t, new Date('2026-11-25T20:00:00Z'));
    expect(Object.keys(b)).toEqual(['app', 'version', 'exportedAt', 'tournament']);
    expect(b).toMatchObject({ app: 'kart-cup-manager', version: CURRENT_VERSION, exportedAt: '2026-11-25T20:00:00.000Z' });
    expect(backupFileName({ name: 'Kart Cup: Nacht 🏁 Ölberg', date: '2026-11-28' })).toBe('kart-cup-nacht-olberg-2026-11-28-backup.json');
    expect(csvFileName({ name: '  ' })).toBe('tournament-standings.csv');
  });
});

describe('undo and change tracking', () => {
  it('[REQ-DATA-013] undo keeps the last 30 snapshots with labels, and the history survives a reload', async () => {
    const s = new FakeStorage();
    const a = await freshStore(s);
    a.startAutosave();
    a.useApp.getState().replace('create', small());
    for (let i = 0; i < 40; i++) a.useApp.getState().apply(`edit ${i}`, (t) => ({ ...t, rngCounter: t.rngCounter + 1 }));
    expect(a.useApp.getState().history).toHaveLength(30);
    expect(a.useApp.getState().history.at(-1)?.label).toBe('edit 39');
    const b = await freshStore(s);
    expect(b.useApp.getState().history).toHaveLength(30);
    expect(b.useApp.getState().undo()).toBe('edit 39');
    expect(b.useApp.getState().t?.rngCounter).toBe(39);
  });

  it('[REQ-DATA-014] import, reset, demo and finals start are each undone as exactly one step', async () => {
    const a = await freshStore(new FakeStorage());
    const st = () => a.useApp.getState();
    st().replace('create', small());
    const base = st().t;
    st().replace('import', demo());
    expect(st().undo()).toBe('import');
    expect(st().t).toBe(base);
    st().replace('reset', null);
    expect(st().t).toBeNull();
    expect(st().undo()).toBe('reset');
    expect(st().t).toBe(base);
    st().apply('start finals', (t) => ({ ...t, finals: { stages: [], qualifyingOrder: [], startedAt: 0 } }));
    expect(st().undo()).toBe('start finals');
    expect(st().t).toBe(base);
  });

  it('[REQ-DATA-015] unsaved changes only when changes are newer than the last export; importing counts as exported', async () => {
    const a = await freshStore(new FakeStorage());
    const st = () => a.useApp.getState();
    const dirty = () => st().changeSeq > st().exportSeq;
    expect(dirty()).toBe(false);
    st().replace('create', small());
    expect(dirty()).toBe(true);
    st().markExported();
    expect(dirty()).toBe(false);
    st().apply('edit', (t) => ({ ...t, rngCounter: 1 }));
    expect(dirty()).toBe(true);
    st().replace('import', demo());
    st().markExported();
    expect(dirty()).toBe(false);
  });

  it('[REQ-DATA-017] ids, change tracking and the leave warning do not depend on the system clock', async () => {
    const a = await freshStore(new FakeStorage());
    const st = () => a.useApp.getState();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(2_000_000_000_000);
    st().replace('create', small());
    st().markExported();
    now.mockReturnValue(1_000); // clock jumps far back
    st().apply('edit', (t) => ({ ...t, rngCounter: 1 }));
    expect(st().changeSeq > st().exportSeq).toBe(true);
    now.mockReturnValue(3_000_000_000_000); // and far forward
    st().markExported();
    expect(st().changeSeq > st().exportSeq).toBe(false);
    now.mockRestore();
    const fixed = vi.spyOn(Date, 'now').mockReturnValue(42);
    const idSet = new Set(Array.from({ length: 500 }, () => a.newId()));
    expect(idSet.size).toBe(500);
    fixed.mockRestore();
  });
});

describe('two windows', () => {
  it('[REQ-DATA-004] two windows: writes go through storage in order and the other window adopts newer data', async () => {
    const s = new FakeStorage();
    const w1 = await freshStore(s);
    w1.startAutosave();
    w1.useApp.getState().replace('create', small());
    const w2 = await freshStore(s);
    w2.startAutosave();
    expect(w2.useApp.getState().t?.players).toHaveLength(3);
    // Window 1 adds a player; window 2 has not heard of it yet and edits.
    w1.useApp.getState().apply('add Dan', (t) => {
      const r = addPlayer(t, { name: 'Dan', color: '#000' }, 'Dan', 0);
      return r.ok ? r.t : t;
    });
    w2.useApp.getState().apply('rename', (t) => ({ ...t, settings: { ...t.settings, name: 'From window 2' } }));
    // Window 2 built on window 1's data instead of overwriting it.
    const r = stored(s);
    expect(r.kind === 'ok' && r.data.t?.players.map((p) => p.name)).toEqual(['Ann', 'Ben', 'Cat', 'Dan']);
    expect(r.kind === 'ok' && r.data.t?.settings.name).toBe('From window 2');
    // Window 1 adopts window 2's write live through the storage event.
    w1.fire('storage', { key: STORAGE_KEY });
    expect(w1.useApp.getState().t?.settings.name).toBe('From window 2');
    expect(w1.useApp.getState().fromOtherWindow).toBe(true);
  });
});

describe('saveEnvelope', () => {
  it('[REQ-DATA-005] trims history halves until it fits, otherwise reports failure without writing', () => {
    const s = new FakeStorage();
    const t = demo();
    const p: Persisted = { t, history: Array.from({ length: 8 }, (_, i) => ({ label: `s${i}`, t })), changeSeq: 1, exportSeq: 0, lastExportAt: 0 };
    s.quota = JSON.stringify({ ...p, history: p.history.slice(6) }).length + STORAGE_KEY.length + 10;
    const r = saveEnvelope(s, p);
    expect(r.ok && r.history.map((h) => h.label)).toEqual(['s6', 's7']);
    s.quota = 10;
    s.data.clear();
    expect(saveEnvelope(s, p)).toEqual({ ok: false });
    expect(s.data.size).toBe(0);
  });
});

describe('preferences', () => {
  it('[REQ-DATA-020] language and sound persist across reloads and are not undoable actions', async () => {
    const s = new FakeStorage();
    const a = await freshStore(s);
    a.startAutosave();
    a.useApp.getState().replace('create', small());
    a.useApp.getState().setPrefs({ lang: 'de', sound: true });
    expect(a.useApp.getState().history.map((h) => h.label)).toEqual(['create']);
    expect(a.useApp.getState().changeSeq).toBe(1);
    const b = await freshStore(s);
    expect(b.useApp.getState().prefs).toEqual({ lang: 'de', sound: true });
  });
});

describe('demo data', () => {
  it('[REQ-ENG-048] "Load demo data" creates 30 fake racers with round 1 simulated', () => {
    const t = demo();
    expect(t.players).toHaveLength(30);
    expect(t.rounds).toHaveLength(1);
    expect(t.rounds[0].heats.every((h) => h.result && h.cup)).toBe(true);
  });
});

describe('schema version 2', () => {
  // Real tournaments written by the version 1 app (commit 1e62f5b): 30 at max 8 per race,
  // 11 at max 4 with totals and Last Chance, 13 at max 8 with Last Chance; mid-qualifying and finished.
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/v1-tournaments.json', import.meta.url), 'utf8')) as {
    mid: Record<string, any>;
    midStandings: unknown;
    done: Record<string, any>;
    standings: unknown;
    final: unknown;
  }[];

  it('[REQ-DATA-023] version 1 data opens as Classic with its heat size, points table and timing', () => {
    for (const f of fixtures) {
      const m = migrateTournament(f.done);
      expect(m.ok).toBe(true);
      if (!m.ok) continue;
      expect(m.repairs).toEqual([]);
      const s = m.t.settings as unknown as Record<string, unknown>;
      expect(m.t.version).toBe(2);
      expect(s.format).toBe('classic');
      expect(s.heatSize).toBe(f.done.settings.maxPerHeat);
      expect(s.points).toEqual(f.done.settings.maxPerHeat === 4 ? f.done.settings.points4 : f.done.settings.points8);
      expect(s.cupOverheadMinutes).toBe(0);
      expect(s.minutesPerRace).toBe(f.done.settings.minutesPerRace);
      expect('maxPerHeat' in s || 'points8' in s || 'points4' in s).toBe(false);
    }
  });

  it('[REQ-DATA-023] version 1 tournaments compute the same standings and finals after migration', () => {
    for (const f of fixtures) {
      const mid = migrateTournament(f.mid);
      const done = migrateTournament(f.done);
      if (!mid.ok || !done.ok) throw new Error('migration failed');
      expect(standings(mid.t)).toEqual(f.midStandings);
      expect(standings(done.t)).toEqual(f.standings);
      expect(finalResults(done.t)).toEqual(f.final);
    }
  });

  it('[REQ-DATA-023] version 1 backups import, and invalid v2 format fields are repaired', () => {
    const f = fixtures[1];
    const r = parseBackup(JSON.stringify({ app: 'kart-cup-manager', exportedAt: '2026-01-01T00:00:00.000Z', tournament: f.done }));
    expect(r.ok && r.t.settings.heatSize).toBe(4);
    const bad = structuredClone(small()) as unknown as Record<string, any>;
    bad.settings.format = 'tetris';
    bad.settings.heatSize = 12;
    bad.settings.entryMode = 'telepathy';
    bad.settings.fill = 42;
    const m = migrateTournament(bad);
    expect(m.ok && m.repairs).toEqual(expect.arrayContaining(['settings.heatSize', 'settings.format', 'settings.entryMode', 'settings.fill']));
    expect(m.ok && m.t.settings).toMatchObject({ heatSize: 8, format: defaultSettings().format, entryMode: defaultSettings().entryMode, fill: defaultSettings().fill });
  });
});
