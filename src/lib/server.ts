// Talking to the Kart Cup server (only when the app was served by it; the
// offline single file never makes a request). The organizer's window starts a
// sign-up session, pulls new sign-ups into the tournament and reports which
// names are taken and whether registration is open.
import { create } from 'zustand';
import { registrationOpen } from '../engine/tournament';
import { checkSignUp, wifiQrText } from '../shared/signup';
import { tNow, useApp } from '../store/store';
import { toast } from '../store/ui';

export const PHONE_KEY = 'kart-cup-manager:phone';
const LEASE_KEY = 'kart-cup-manager:phone-lease';
const POLL_MS = 1500;
const STATE_EVERY_MS = 20_000;

/** True when the page was served by the Kart Cup server (it injects this marker). */
export function serverMode(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('meta[name="kart-cup-server"]') && location.protocol.startsWith('http');
}

export interface PhoneSession {
  code: string;
  adminKey: string;
  tournamentId: string;
  lastSeq: number;
  base: string;
}

export type PhoneStatus = 'off' | 'starting' | 'live' | 'offline' | 'ended';

export interface ServerInfo {
  /** The server's name for guests (e.g. kartcup.lan), when it has one. */
  host: string | null;
  /** The Pi's own Wi-Fi, when it runs one. */
  wifi: { ssid: string; password: string } | null;
  captive: boolean;
}

interface PhoneState {
  status: PhoneStatus;
  session: PhoneSession | null;
  info: ServerInfo | null;
}

export const usePhone = create<PhoneState>(() => ({ status: 'off', session: readSession(), info: null }));

/** What the server tells about itself (name, Wi-Fi). Cached in the store. */
export async function loadServerInfo(): Promise<ServerInfo | null> {
  if (!serverMode()) return null;
  try {
    const r = await api('/api/info');
    if (r.status !== 200) return null;
    const w = r.body.wifi as { ssid?: unknown; password?: unknown } | null;
    const info: ServerInfo = {
      host: typeof r.body.host === 'string' ? r.body.host : null,
      wifi: w && typeof w.ssid === 'string' ? { ssid: w.ssid, password: typeof w.password === 'string' ? w.password : '' } : null,
      captive: r.body.captive === true,
    };
    usePhone.setState({ info });
    return info;
  } catch {
    return null;
  }
}

/** The QR text that joins the server's Wi-Fi, or null. */
export function wifiQr(info: ServerInfo | null): string | null {
  return info?.wifi ? wifiQrText(info.wifi.ssid, info.wifi.password) : null;
}

function readSession(): PhoneSession | null {
  try {
    const raw = localStorage.getItem(PHONE_KEY);
    return raw ? (JSON.parse(raw) as PhoneSession) : null;
  } catch {
    return null;
  }
}

function writeSession(s: PhoneSession | null) {
  try {
    if (s) localStorage.setItem(PHONE_KEY, JSON.stringify(s));
    else localStorage.removeItem(PHONE_KEY);
  } catch {
    /* storage problems are shown by the main banner */
  }
  usePhone.setState({ session: s });
}

/** The join link for a session; phones need a network address, not localhost. */
export function joinUrl(s: Pick<PhoneSession, 'code' | 'base'>): string {
  return `${s.base}/#/s/${s.code}`;
}

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

/** Prefer home-network addresses (192.168/10/172.16–31) over VPN or other ranges. */
export function pickBase(bases: string[]): string {
  const score = (b: string) => (/\/\/192\.168\./.test(b) ? 0 : /\/\/10\./.test(b) ? 1 : /\/\/172\.(1[6-9]|2\d|3[01])\./.test(b) ? 2 : 3);
  return bases.slice().sort((a, b) => score(a) - score(b))[0] ?? location.origin;
}

async function api(path: string, init: RequestInit & { key?: string } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.key) headers.Authorization = `Bearer ${init.key}`;
  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

export async function startPhoneSignUp(): Promise<boolean> {
  const t = useApp.getState().t;
  if (!t || !serverMode()) return false;
  usePhone.setState({ status: 'starting' });
  try {
    const r = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ hours: 24 }) });
    if (r.status !== 201) throw new Error(String(r.body.error));
    // A named server (the Pi's own Wi-Fi) is always reached by its name; otherwise the address in use.
    const bases = (r.body.bases as string[]) ?? [];
    const base = r.body.host ? (bases[0] ?? location.origin) : isLocalHost(location.hostname) ? pickBase(bases) : location.origin;
    writeSession({ code: r.body.code as string, adminKey: r.body.adminKey as string, tournamentId: t.id, lastSeq: 0, base });
    usePhone.setState({ status: 'live' });
    lastState = '';
    void tick();
    return true;
  } catch {
    usePhone.setState({ status: 'offline' });
    toast(tNow('phone.startFailed'), 'error');
    return false;
  }
}

export async function stopPhoneSignUp(): Promise<void> {
  const s = usePhone.getState().session;
  writeSession(null);
  usePhone.setState({ status: 'off' });
  if (s) await api(`/api/s/${s.code}`, { method: 'DELETE', key: s.adminKey }).catch(() => {});
}

// ---- the pull loop (one organizer window at a time holds a short lease)

const windowId = Math.random().toString(36).slice(2);
function holdLease(): boolean {
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    const lease = raw ? (JSON.parse(raw) as { id: string; until: number }) : null;
    if (lease && lease.id !== windowId && lease.until > Date.now()) return false;
    localStorage.setItem(LEASE_KEY, JSON.stringify({ id: windowId, until: Date.now() + POLL_MS * 3 }));
    return true;
  } catch {
    return true;
  }
}

let lastState = '';
let lastStateAt = 0;
let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  const s = readSession();
  const t = useApp.getState().t;
  if (!s || !t) return;
  if (s.tournamentId !== t.id) {
    // A different tournament is open now: this session belongs to the old one.
    await stopPhoneSignUp();
    return;
  }
  if (!holdLease()) return;
  busy = true;
  try {
    const r = await api(`/api/s/${s.code}/admin/signups?after=${s.lastSeq}`, { key: s.adminKey });
    if (r.status === 401 || r.status === 404) {
      writeSession(null);
      usePhone.setState({ status: 'ended' });
      toast(tNow('phone.ended'), 'error');
      return;
    }
    if (r.status !== 200) throw new Error('status');
    let seq = s.lastSeq;
    for (const raw of (r.body.signups as { seq: number; via?: string }[]) ?? []) {
      seq = Math.max(seq, Number(raw.seq) || 0);
      const checked = checkSignUp(raw);
      if (!checked.ok) continue;
      const tour = useApp.getState().t!;
      const res = useApp.getState().dispatch({ type: 'addPlayer', player: { ...checked.value, status: tour.settings.kioskAutoCheckIn ? 'checked-in' : 'registered' } });
      if (res.ok) toast(tNow(raw.via === 'desk' ? 'phone.joinedDesk' : 'phone.joined', { name: checked.value.name }), 'success');
      else toast(tNow('phone.skipped', { name: checked.value.name }), 'error');
    }
    if (seq !== s.lastSeq) writeSession({ ...s, lastSeq: seq });
    // Report the names and whether sign-ups are open (on change, and now and then).
    const cur = useApp.getState().t!;
    const state = JSON.stringify({ open: registrationOpen(cur), title: cur.settings.name, names: cur.players.map((p) => p.name), seen: seq });
    if (state !== lastState || Date.now() - lastStateAt > STATE_EVERY_MS) {
      const put = await api(`/api/s/${s.code}/admin/state`, { method: 'PUT', key: s.adminKey, body: state });
      if (put.status === 200) {
        lastState = state;
        lastStateAt = Date.now();
      }
    }
    usePhone.setState({ status: 'live' });
  } catch {
    usePhone.setState({ status: 'offline' });
  } finally {
    busy = false;
  }
}

/** Run the pull loop in organizer windows (not on the TV, phones or the station). */
export function startPhoneSync(): () => void {
  if (!serverMode()) return () => {};
  void loadServerInfo();
  if (readSession()) usePhone.setState({ status: 'starting' });
  const id = window.setInterval(() => void tick(), POLL_MS);
  void tick();
  return () => window.clearInterval(id);
}

// ---- guests: phones and the station

export type GuestError = 'name-required' | 'name-too-long' | 'tag-too-long' | 'bad-color' | 'name-taken' | 'closed' | 'full' | 'rate-limited' | 'unknown-session' | 'network';

export async function sessionInfo(code: string): Promise<{ ok: true; title: string; open: boolean } | { ok: false; error: GuestError }> {
  try {
    const r = await api(`/api/s/${encodeURIComponent(code)}`);
    if (r.status === 200) return { ok: true, title: String(r.body.title ?? ''), open: r.body.open === true };
    return { ok: false, error: r.status === 429 ? 'rate-limited' : 'unknown-session' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function signUp(code: string, input: { name: string; tag: string; color: string }, via: 'phone' | 'desk' = 'phone'): Promise<{ ok: true; name: string; color: string } | { ok: false; error: GuestError }> {
  try {
    const r = await api(`/api/s/${encodeURIComponent(code)}/signups`, { method: 'POST', body: JSON.stringify({ ...input, via }) });
    if (r.status === 201) return { ok: true, name: String(r.body.name), color: String(r.body.color) };
    const e = String(r.body.error ?? '');
    const known: GuestError[] = ['name-required', 'name-too-long', 'tag-too-long', 'bad-color', 'name-taken', 'closed', 'full', 'rate-limited', 'unknown-session'];
    return { ok: false, error: (known as string[]).includes(e) ? (e as GuestError) : 'network' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** The station on the server's own screen: the newest session, if any. */
export async function localSession(): Promise<{ code: string; base: string; wifi: { qr: string; ssid: string; password: string } | null } | null | 'not-local'> {
  try {
    const r = await api('/api/local/session');
    if (r.status === 403) return 'not-local';
    if (r.status !== 200) return null;
    const w = r.body.wifi as { ssid?: unknown; password?: unknown } | null;
    const pw = w && typeof w.password === 'string' ? w.password : '';
    const wifi = w && typeof w.ssid === 'string' ? { qr: wifiQrText(w.ssid, pw), ssid: w.ssid, password: pw } : null;
    return { code: String(r.body.code), base: pickBase((r.body.bases as string[]) ?? []), wifi };
  } catch {
    return null;
  }
}
