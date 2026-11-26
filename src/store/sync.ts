// Keeps the Big Screen window in sync. BroadcastChannel is the primary channel;
// the localStorage "storage" event is a fallback for browsers that isolate
// file:// pages from each other.
import type { Tournament } from '../engine/types';
import type { Lang } from '../i18n';
import { parsePersisted, PREFS_KEY, STORAGE_KEY } from './persist';
import { useApp } from './store';
import { joinUrl, usePhone, wifiQr } from '../lib/server';

const CHANNEL = 'kart-cup-manager';

export interface SyncMessage {
  type: 'state';
  t: Tournament | null;
  lang: Lang;
  /** Phone sign-up link while a session runs (the TV shows its QR code). */
  join?: string | null;
  /** QR text that joins the Pi's own Wi-Fi (with its name for the caption). */
  wifi?: { qr: string; ssid: string; password: string } | null;
}

export function startBroadcast(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  const send = () => {
    const s = useApp.getState();
    const phone = usePhone.getState().session;
    const info = usePhone.getState().info;
    const qr = wifiQr(info);
    ch.postMessage({ type: 'state', t: s.t, lang: s.prefs.lang, join: phone ? joinUrl(phone) : null, wifi: phone && qr && info?.wifi ? { qr, ssid: info.wifi.ssid, password: info.wifi.password } : null } satisfies SyncMessage);
  };
  ch.onmessage = (e) => {
    if (e.data?.type === 'hello') send();
  };
  const unsub = useApp.subscribe((s, prev) => {
    if (s.t !== prev.t || s.prefs.lang !== prev.prefs.lang) send();
  });
  const unsubPhone = usePhone.subscribe((s, prev) => {
    if (s.session !== prev.session || s.info !== prev.info) send();
  });
  return () => {
    unsub();
    unsubPhone();
    ch.close();
  };
}

export function listenForState(onState: (m: SyncMessage) => void): () => void {
  const read = () => {
    try {
      const r = parsePersisted(localStorage.getItem(STORAGE_KEY));
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
      if (r.kind === 'ok') onState({ type: 'state', t: r.data.t, lang: prefs.lang === 'de' ? 'de' : 'en' });
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
    if (e.key === STORAGE_KEY || e.key === PREFS_KEY) read();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}
