// Keeps the Big Screen window in sync. BroadcastChannel is the primary channel;
// the localStorage "storage" event is a fallback for browsers that isolate
// file:// pages from each other.
import type { Tournament } from '../engine/types';
import type { Lang } from '../i18n';
import { STORAGE_KEY, useApp } from './store';

const CHANNEL = 'kart-cup-manager';

export interface SyncMessage {
  type: 'state';
  t: Tournament | null;
  lang: Lang;
}

export function startBroadcast(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  const send = () => {
    const s = useApp.getState();
    ch.postMessage({ type: 'state', t: s.t, lang: s.prefs.lang } satisfies SyncMessage);
  };
  ch.onmessage = (e) => {
    if (e.data?.type === 'hello') send();
  };
  const unsub = useApp.subscribe((s, prev) => {
    if (s.t !== prev.t || s.prefs.lang !== prev.prefs.lang) send();
  });
  return () => {
    unsub();
    ch.close();
  };
}

export function listenForState(onState: (m: SyncMessage) => void): () => void {
  const read = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(localStorage.getItem('kart-cup-manager:prefs') ?? '{}');
      if (raw) onState({ type: 'state', t: JSON.parse(raw).t ?? null, lang: prefs.lang ?? 'en' });
    } catch {
      /* ignore */
    }
  };
  read();
  let ch: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'state') onState(e.data as SyncMessage);
    };
    ch.postMessage({ type: 'hello' });
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === 'kart-cup-manager:prefs') read();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}
