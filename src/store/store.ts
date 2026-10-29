import { create } from 'zustand';
import type { Tournament } from '../engine/types';
import type { Key, Lang, Params } from '../i18n';
import { translate } from '../i18n';
import { randomId } from '../engine/rng';

export const STORAGE_KEY = 'kart-cup-manager:v1';
export const PREFS_KEY = 'kart-cup-manager:prefs';
export const HISTORY_LIMIT = 30;

export interface Snapshot {
  label: string;
  t: Tournament | null;
}

export interface Prefs {
  lang: Lang;
  sound: boolean;
}

interface Persisted {
  t: Tournament | null;
  history: Snapshot[];
  lastChangeAt: number;
  lastExportAt: number;
}

export interface AppState extends Persisted {
  prefs: Prefs;
  /** Apply a pure transition and remember the previous state for undo. */
  apply: (label: string, fn: (t: Tournament) => Tournament) => void;
  replace: (label: string, t: Tournament | null) => void;
  undo: () => string | null;
  markExported: () => void;
  setPrefs: (p: Partial<Prefs>) => void;
}

export const newId = () => randomId(Math.random, '');

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p && 'history' in p) return { t: p.t ?? null, history: p.history ?? [], lastChangeAt: p.lastChangeAt ?? 0, lastExportAt: p.lastExportAt ?? 0 };
    }
  } catch {
    /* corrupted storage: start fresh */
  }
  return { t: null, history: [], lastChangeAt: 0, lastExportAt: 0 };
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { lang: 'en', sound: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // English by default (spec); German is one click away in the top bar.
  return { lang: 'en', sound: false };
}

export const useApp = create<AppState>((set, get) => ({
  ...loadPersisted(),
  prefs: loadPrefs(),
  apply: (label, fn) => {
    const { t, history } = get();
    if (!t) return;
    const next = fn(t);
    if (next === t) return;
    set({ t: next, history: [...history, { label, t }].slice(-HISTORY_LIMIT), lastChangeAt: Date.now() });
  },
  replace: (label, t) => {
    const { t: prev, history } = get();
    set({ t, history: [...history, { label, t: prev }].slice(-HISTORY_LIMIT), lastChangeAt: Date.now() });
  },
  undo: () => {
    const { history } = get();
    const last = history[history.length - 1];
    if (!last) return null;
    set({ t: last.t, history: history.slice(0, -1), lastChangeAt: Date.now() });
    return last.label;
  },
  markExported: () => set({ lastExportAt: Date.now() }),
  setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
}));

/** Autosave every change. If storage is full, drop the oldest undo snapshots first. */
export function startAutosave(): () => void {
  let last: Pick<AppState, 't' | 'history' | 'lastExportAt'> | null = null;
  let lastPrefs: Prefs | null = null;
  const save = (s: AppState) => {
    if (s.prefs !== lastPrefs) {
      lastPrefs = s.prefs;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(s.prefs));
      } catch {
        /* ignore */
      }
    }
    if (last && last.t === s.t && last.history === s.history && last.lastExportAt === s.lastExportAt) return;
    last = { t: s.t, history: s.history, lastExportAt: s.lastExportAt };
    let history = s.history;
    for (;;) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ t: s.t, history, lastChangeAt: s.lastChangeAt, lastExportAt: s.lastExportAt }));
        return;
      } catch {
        if (!history.length) return;
        history = history.slice(Math.ceil(history.length / 2));
      }
    }
  };
  save(useApp.getState());
  return useApp.subscribe(save);
}

export function useT() {
  const lang = useApp((s) => s.prefs.lang);
  return (key: Key, params?: Params) => translate(lang, key, params);
}

export function tNow(key: Key, params?: Params) {
  return translate(useApp.getState().prefs.lang, key, params);
}
