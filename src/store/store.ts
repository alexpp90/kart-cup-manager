import { create } from 'zustand';
import type { Tournament } from '../engine/types';
import type { Key, Lang, Params } from '../i18n';
import { translate } from '../i18n';
import { randomId } from '../engine/rng';
import { applyCommand, commandLabel, type Command, type CommandResult } from '../engine/commands';
import { toast } from './ui';
import {
  CORRUPT_KEY,
  emptyPersisted,
  getStorage,
  HISTORY_LIMIT,
  parsePersisted,
  PREFS_KEY,
  saveEnvelope,
  STORAGE_KEY,
  storageWorks,
  type Persisted,
  type Snapshot,
} from './persist';

export { HISTORY_LIMIT, PREFS_KEY, STORAGE_KEY };
export type { Snapshot };

export interface Prefs {
  lang: Lang;
  sound: boolean;
}

/** 'unavailable': storage throws or is missing; 'full': the tournament itself no longer fits. */
export type StorageStatus = 'ok' | 'unavailable' | 'full';

export interface Recovery {
  raw: string;
  reason: 'json' | 'invalid' | 'newer';
}

export interface AppState extends Persisted {
  prefs: Prefs;
  storage: StorageStatus;
  /** Set when the stored data could not be read; the app shows the recovery screen. */
  recovery: Recovery | null;
  /** Fields that were filled with defaults on load (reported once). */
  repairs: string[];
  /** True right after data written by another window was adopted (it is already stored). */
  fromOtherWindow: boolean;
  /** Apply a pure transition and remember the previous state for undo. */
  apply: (label: string, fn: (t: Tournament) => Tournament) => void;
  /** Apply a command (see engine/commands.ts); unchanged state on failure. */
  dispatch: (cmd: Command) => CommandResult;
  replace: (label: string, t: Tournament | null) => void;
  undo: () => string | null;
  markExported: () => void;
  setPrefs: (p: Partial<Prefs>) => void;
  /** Leave the recovery screen with a fresh start or an imported tournament. */
  resolveRecovery: (t: Tournament | null) => void;
  /** Adopt newer data that another window wrote. Returns true when something was adopted. */
  syncFromStorage: () => boolean;
}

export const newId = () => randomId(Math.random, '');

interface Loaded {
  data: Persisted;
  storage: StorageStatus;
  recovery: Recovery | null;
  repairs: string[];
}

/** The big screen window only listens: it must not even probe the storage with a test write. */
const READ_ONLY = typeof location !== 'undefined' && /^#\/?(big|s|desk)\b/.test(location.hash);

function loadPersisted(): Loaded {
  const storage = getStorage();
  if (!READ_ONLY && !storageWorks(storage)) {
    // Maybe readable but not writable: still show what is there.
    let data = emptyPersisted();
    try {
      const r = parsePersisted(storage?.getItem(STORAGE_KEY) ?? null);
      if (r.kind === 'ok') data = r.data;
    } catch {
      /* not even readable */
    }
    return { data, storage: 'unavailable', recovery: null, repairs: [] };
  }
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return { data: emptyPersisted(), storage: 'unavailable', recovery: null, repairs: [] };
  }
  const r = parsePersisted(raw);
  if (r.kind === 'empty') return { data: emptyPersisted(), storage: 'ok', recovery: null, repairs: [] };
  if (r.kind === 'corrupt') {
    try {
      if (!READ_ONLY) storage!.setItem(CORRUPT_KEY, r.raw);
    } catch {
      /* the original is still under STORAGE_KEY: autosave is paused during recovery */
    }
    return { data: emptyPersisted(), storage: 'ok', recovery: { raw: r.raw, reason: r.reason }, repairs: [] };
  }
  return { data: r.data, storage: 'ok', recovery: null, repairs: r.repairs };
}

function loadPrefs(): Prefs {
  try {
    const raw = getStorage()?.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { lang: p.lang === 'de' ? 'de' : 'en', sound: p.sound === true };
    }
  } catch {
    /* ignore */
  }
  // English by default (spec); German is one click away in the top bar.
  return { lang: 'en', sound: false };
}

/** Newer data from another window, if any. */
function readNewer(changeSeq: number): Persisted | null {
  try {
    const r = parsePersisted(getStorage()?.getItem(STORAGE_KEY) ?? null);
    return r.kind === 'ok' && r.data.changeSeq > changeSeq ? r.data : null;
  } catch {
    return null;
  }
}

const initial = loadPersisted();

export const useApp = create<AppState>((set, get) => ({
  ...initial.data,
  storage: initial.storage,
  recovery: initial.recovery,
  repairs: initial.repairs,
  fromOtherWindow: false,
  prefs: loadPrefs(),
  apply: (label, fn) => {
    get().syncFromStorage();
    const { t, history, changeSeq } = get();
    if (!t) return;
    const next = fn(t);
    if (next === t) return;
    set({ t: next, history: [...history, { label, t }].slice(-HISTORY_LIMIT), changeSeq: changeSeq + 1, fromOtherWindow: false });
  },
  dispatch: (cmd) => {
    get().syncFromStorage();
    const t = get().t;
    if (!t) return { ok: false, error: 'no-tournament' };
    const r = applyCommand(t, cmd, { now: Date.now(), newId });
    if (r.ok && r.t !== t) {
      const l = commandLabel(t, cmd);
      const label = translate(get().prefs.lang, l.key as Key, l.params);
      const { history, changeSeq } = get();
      set({ t: r.t, history: [...history, { label, t }].slice(-HISTORY_LIMIT), changeSeq: changeSeq + 1, fromOtherWindow: false });
    }
    return r;
  },
  replace: (label, t) => {
    get().syncFromStorage();
    const { t: prev, history, changeSeq } = get();
    set({ t, history: [...history, { label, t: prev }].slice(-HISTORY_LIMIT), changeSeq: changeSeq + 1, fromOtherWindow: false });
  },
  undo: () => {
    get().syncFromStorage();
    const { history, changeSeq } = get();
    const last = history[history.length - 1];
    if (!last) return null;
    set({ t: last.t, history: history.slice(0, -1), changeSeq: changeSeq + 1, fromOtherWindow: false });
    return last.label;
  },
  markExported: () => set({ exportSeq: get().changeSeq, lastExportAt: Date.now() }),
  setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
  resolveRecovery: (t) => {
    const { changeSeq } = get();
    set({ recovery: null, t, history: [], changeSeq: changeSeq + 1, exportSeq: t ? changeSeq + 1 : 0, fromOtherWindow: false });
  },
  syncFromStorage: () => {
    const s = get();
    if (s.recovery || s.storage === 'unavailable') return false;
    const newer = readNewer(s.changeSeq);
    if (!newer) return false;
    set({ ...newer, fromOtherWindow: true });
    toast(translate(s.prefs.lang, 'sync.adopted'));
    return true;
  },
}));

/**
 * Autosave every change. If storage is full, drop the oldest undo snapshots
 * first; if the tournament itself does not fit, keep the old stored data and
 * flag `storage: 'full'` so the app can offer a backup export.
 * Paused while the recovery screen is shown, so damaged data is never overwritten.
 */
export function startAutosave(): () => void {
  let last: Pick<AppState, 't' | 'history' | 'exportSeq' | 'changeSeq'> | null = null;
  let lastPrefs: Prefs | null = null;
  const save = (s: AppState) => {
    const storage = getStorage();
    if (s.prefs !== lastPrefs) {
      lastPrefs = s.prefs;
      try {
        storage?.setItem(PREFS_KEY, JSON.stringify(s.prefs));
      } catch {
        /* ignore: prefs never block the tournament save */
      }
    }
    if (s.recovery || s.storage === 'unavailable' || !storage) return;
    if (last && last.t === s.t && last.history === s.history && last.exportSeq === s.exportSeq && last.changeSeq === s.changeSeq) return;
    last = { t: s.t, history: s.history, exportSeq: s.exportSeq, changeSeq: s.changeSeq };
    // Data adopted from another window is already stored.
    if (s.fromOtherWindow) return;
    const r = saveEnvelope(storage, { t: s.t, history: s.history, changeSeq: s.changeSeq, exportSeq: s.exportSeq, lastExportAt: s.lastExportAt });
    if (!r.ok) {
      if (s.storage !== 'full') useApp.setState({ storage: 'full' });
    } else {
      if (r.trimmed) useApp.setState({ history: r.history });
      if (s.storage === 'full') useApp.setState({ storage: 'ok' });
    }
  };
  save(useApp.getState());
  const unsub = useApp.subscribe(save);
  // Another window saved: adopt its data live.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) useApp.getState().syncFromStorage();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    unsub();
    window.removeEventListener('storage', onStorage);
  };
}

export function useT() {
  const lang = useApp((s) => s.prefs.lang);
  return (key: Key, params?: Params) => translate(lang, key, params);
}

export function tNow(key: Key, params?: Params) {
  return translate(useApp.getState().prefs.lang, key, params);
}
