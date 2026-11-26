/// <reference types="node" />
// The Kart Cup server: serves the app and collects sign-ups from phones and the
// sign-up station. No dependencies (node:http, node:crypto, node:fs only), runs
// on Node 18+ (Raspberry Pi OS), keeps no IP addresses anywhere but in memory
// for rate limits, and never makes a request to anybody.
//
// The organizer's browser stays the source of truth for the tournament: it
// creates a sign-up session, pulls new sign-ups and turns them into players,
// and tells the server which names are taken and whether registration is open.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, promises as fsp, readdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { checkSignUp, CODE_ALPHABET, CODE_LENGTH, isCode, MAX_PLAYERS, nameKey } from '../shared/signup';

export interface ServerOptions {
  dataDir: string;
  /** The app's index.html (read once at start). */
  html: string;
  port: number;
  now?: () => number;
  maxSessionHours?: number;
  maxSessions?: number;
  /** Fixed base URL for join links, e.g. http://192.168.178.50:8080 (else the LAN addresses). */
  publicUrl?: string;
  /** LAN base URLs, e.g. ["http://192.168.178.50:8080"]. */
  addresses?: () => string[];
  /** The name guests reach the server by, e.g. "kartcup.lan" (join links use it). */
  hostName?: string;
  /** The Pi's own Wi-Fi, shown as a QR code that joins it. */
  wifi?: { ssid: string; password: string } | null;
  /**
   * Captive sign-up (the Pi's own Wi-Fi): requests for any other host, such as
   * phones' connection checks, are sent to /join, so joining the Wi-Fi opens
   * the sign-up page by itself.
   */
  captive?: boolean;
}

export interface StoredSignUp {
  seq: number;
  name: string;
  tag: string;
  color: string;
  at: number;
  /** 'phone' or 'desk' (the station on the server's own screen). */
  via: 'phone' | 'desk';
}

interface Session {
  code: string;
  keyHash: string;
  createdAt: number;
  expiresAt: number;
  open: boolean;
  title: string;
  /** Names of the tournament's players, as last reported by the organizer. */
  names: string[];
  /** Highest sign-up seq the organizer had applied when it reported `names`. */
  seen: number;
  seq: number;
  signups: StoredSignUp[];
}

export const LIMITS = {
  bodyBytes: 16 * 1024,
  createPerHourPerIp: 5,
  signupsPerMinutePerIp: 10,
  signupsPerMinutePerSession: 30,
  badCodesPer10MinPerIp: 20,
  namesInState: 200,
};

/** Sliding-window counter in memory. */
export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number,
  ) {}
  /** Count a hit; false when the limit is already reached. */
  hit(key: string): boolean {
    if (this.blocked(key)) return false;
    this.hits.get(key)!.push(this.now());
    return true;
  }
  blocked(key: string): boolean {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.length) this.hits.delete(k);
    return list.length >= this.limit;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function newCode(taken: (c: string) => boolean): string {
  for (;;) {
    const bytes = randomBytes(CODE_LENGTH);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!taken(code)) return code;
  }
}

const isLoopback = (ip: string | undefined) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/** The marker that tells the app it was served by this server (Host/phone features on). */
export const SERVER_MARKER = '<meta name="kart-cup-server" content="1">';

export function injectMarker(html: string): string {
  return html.includes('</head>') ? html.replace('</head>', `${SERVER_MARKER}</head>`) : SERVER_MARKER + html;
}

export function createApp(opts: ServerOptions) {
  const now = opts.now ?? Date.now;
  const maxHours = opts.maxSessionHours ?? 72;
  const maxSessions = opts.maxSessions ?? 20;
  const dir = path.join(opts.dataDir, 'sessions');
  mkdirSync(dir, { recursive: true });
  const page = injectMarker(opts.html);
  const sessions = new Map<string, Session>();
  const writes = new Map<string, Promise<void>>();

  const createLimit = new Limiter(LIMITS.createPerHourPerIp, 3600_000, now);
  const ipSignups = new Limiter(LIMITS.signupsPerMinutePerIp, 60_000, now);
  const sessionSignups = new Limiter(LIMITS.signupsPerMinutePerSession, 60_000, now);
  const badCodes = new Limiter(LIMITS.badCodesPer10MinPerIp, 600_000, now);

  // ---- persistence: one JSON file per session, written atomically (temp file + rename).
  for (const f of readdirSync(dir)) {
    if (!/^[A-Z0-9]{6}\.json$/.test(f)) continue;
    try {
      const s = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Session;
      if (isCode(s.code) && typeof s.keyHash === 'string' && Array.isArray(s.signups) && s.expiresAt > now()) sessions.set(s.code, s);
    } catch {
      /* a broken file is ignored; it is never served */
    }
  }
  const save = (s: Session): Promise<void> => {
    const file = path.join(dir, `${s.code}.json`);
    const prev = writes.get(s.code) ?? Promise.resolve();
    const next = prev.then(async () => {
      if (!sessions.has(s.code)) return;
      const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(s));
      await fsp.rename(tmp, file);
    });
    writes.set(s.code, next.catch(() => {}));
    return next;
  };
  const remove = async (code: string) => {
    sessions.delete(code);
    await (writes.get(code) ?? Promise.resolve());
    await fsp.rm(path.join(dir, `${code}.json`), { force: true });
  };
  const purge = async () => {
    for (const s of [...sessions.values()]) if (s.expiresAt <= now()) await remove(s.code);
  };

  // ---- HTTP helpers
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, error: string) => send(res, status, { ok: false, error });

  const readJson = (req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> =>
    new Promise((resolve) => {
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return resolve({ ok: false, status: 415, error: 'json-only' });
      const declared = Number(req.headers['content-length'] ?? 0);
      if (declared > LIMITS.bodyBytes) return resolve({ ok: false, status: 413, error: 'too-large' });
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > LIMITS.bodyBytes && !done) {
          done = true;
          resolve({ ok: false, status: 413, error: 'too-large' });
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        done = true;
        try {
          resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') });
        } catch {
          resolve({ ok: false, status: 400, error: 'bad-json' });
        }
      });
      req.on('error', () => !done && resolve({ ok: false, status: 400, error: 'bad-request' }));
    });

  const authorized = (req: IncomingMessage, s: Session): boolean => {
    const m = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(req.headers.authorization ?? '');
    if (!m) return false;
    const a = Buffer.from(sha256(m[1]), 'hex');
    const b = Buffer.from(s.keyHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  };

  /** Look up a session; unknown codes count against the caller's IP. */
  const lookup = (code: string, ip: string, res: ServerResponse): Session | null => {
    if (badCodes.blocked(ip)) {
      fail(res, 429, 'rate-limited');
      return null;
    }
    const s = isCode(code) ? sessions.get(code) : undefined;
    if (!s || s.expiresAt <= now()) {
      badCodes.hit(ip);
      fail(res, 404, 'unknown-session');
      return null;
    }
    return s;
  };

  const taken = (s: Session): Set<string> => {
    const set = new Set(s.names.map(nameKey));
    for (const su of s.signups) if (su.seq > s.seen) set.add(nameKey(su.name));
    return set;
  };

  const ownBase = opts.hostName ? `http://${opts.hostName}${opts.port === 80 ? '' : `:${opts.port}`}` : null;
  const joinBases = () => (opts.publicUrl ? [opts.publicUrl.replace(/\/$/, '')] : ownBase ? [ownBase] : (opts.addresses?.() ?? []));
  const newest = () => [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
  /** Hosts this server answers as itself: its name, localhost and IP addresses. */
  const isOwnHost = (host: string) => {
    const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    const name = opts.hostName?.toLowerCase();
    return !h || h === name || (!!name && h === name.split('.')[0]) || h === 'localhost' || h.endsWith('.local') || /^[\d.]+$/.test(h) || h.includes(':');
  };
  const redirect = (res: ServerResponse, to: string) => {
    res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end();
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = req.socket.remoteAddress ?? '?';
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method ?? 'GET';
    await purge();

    // ---- captive sign-up: phones' connection checks and other hosts go to /join
    if (opts.captive && !isOwnHost(req.headers.host ?? '')) return redirect(res, `${ownBase ?? ''}/join`);

    // ---- /join: the current sign-up (the QR code for phones already on the Wi-Fi, and captive pages)
    if (url.pathname === '/join' && (method === 'GET' || method === 'HEAD')) {
      const s = newest();
      return redirect(res, s ? `/#/s/${s.code}` : '/#/s');
    }

    // ---- the app
    if ((method === 'GET' || method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, ...SECURITY_HEADERS });
      res.end(method === 'HEAD' ? undefined : page);
      return;
    }
    if (parts[0] !== 'api') return fail(res, 404, 'not-found');

    // ---- GET /api/info: where phones can reach this server
    if (parts[1] === 'info' && parts.length === 2) {
      if (method !== 'GET') return fail(res, 405, 'method');
      return send(res, 200, { ok: true, bases: joinBases(), port: opts.port, host: opts.hostName ?? null, wifi: opts.wifi ?? null, captive: !!opts.captive });
    }

    // ---- GET /api/local/session: the newest open session, only for the server's own screen
    if (parts[1] === 'local' && parts[2] === 'session' && parts.length === 3) {
      if (method !== 'GET') return fail(res, 405, 'method');
      if (!isLoopback(ip)) return fail(res, 403, 'local-only');
      const n = newest();
      return n ? send(res, 200, { ok: true, code: n.code, bases: joinBases(), wifi: opts.wifi ?? null }) : fail(res, 404, 'no-session');
    }

    // ---- POST /api/sessions: start a sign-up session
    if (parts[1] === 'sessions' && parts.length === 2) {
      if (method !== 'POST') return fail(res, 405, 'method');
      const body = await readJson(req);
      if (!body.ok) return fail(res, body.status, body.error);
      if (!createLimit.hit(ip)) return fail(res, 429, 'rate-limited');
      if (sessions.size >= maxSessions) return fail(res, 503, 'too-many-sessions');
      const b = (body.value ?? {}) as Record<string, unknown>;
      const hours = Math.min(maxHours, typeof b.hours === 'number' && b.hours > 0 ? b.hours : 24);
      const key = randomBytes(16).toString('base64url');
      const s: Session = {
        code: newCode((c) => sessions.has(c)),
        keyHash: sha256(key),
        createdAt: now(),
        expiresAt: now() + hours * 3600_000,
        open: true,
        title: '',
        names: [],
        seen: 0,
        seq: 0,
        signups: [],
      };
      sessions.set(s.code, s);
      await save(s);
      return send(res, 201, { ok: true, code: s.code, adminKey: key, expiresAt: s.expiresAt, bases: joinBases(), host: opts.hostName ?? null });
    }

    // ---- /api/s/:code/...
    if (parts[1] !== 's' || !parts[2]) return fail(res, 404, 'not-found');
    const s = lookup(parts[2], ip, res);
    if (!s) return;
    const rest = parts.slice(3).join('/');

    if (rest === '') {
      if (method === 'GET') return send(res, 200, { ok: true, title: s.title, open: s.open, count: s.names.length });
      if (method === 'DELETE') {
        if (!authorized(req, s)) {
          badCodes.hit(ip);
          return fail(res, 401, 'unauthorized');
        }
        await remove(s.code);
        return send(res, 200, { ok: true });
      }
      return fail(res, 405, 'method');
    }

    if (rest === 'signups') {
      if (method !== 'POST') return fail(res, 405, 'method');
      const body = await readJson(req);
      if (!body.ok) return fail(res, body.status, body.error);
      if (!ipSignups.hit(ip) || !sessionSignups.hit(s.code)) return fail(res, 429, 'rate-limited');
      const checked = checkSignUp(body.value);
      if (!checked.ok) return fail(res, 400, checked.error);
      if (!s.open) return fail(res, 403, 'closed');
      const pending = s.signups.filter((x) => x.seq > s.seen).length;
      if (s.names.length + pending >= MAX_PLAYERS || s.signups.length >= MAX_PLAYERS * 2) return fail(res, 403, 'full');
      if (taken(s).has(nameKey(checked.value.name))) return fail(res, 409, 'name-taken');
      const via = isLoopback(ip) && (body.value as Record<string, unknown>).via === 'desk' ? 'desk' : 'phone';
      const su: StoredSignUp = { seq: ++s.seq, ...checked.value, at: now(), via };
      s.signups.push(su);
      await save(s);
      return send(res, 201, { ok: true, name: su.name, color: su.color });
    }

    // ---- organizer only (Authorization: Bearer <admin key>)
    if (rest.startsWith('admin/')) {
      if (!authorized(req, s)) {
        badCodes.hit(ip);
        return fail(res, 401, 'unauthorized');
      }
      if (rest === 'admin/signups' && method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0) || 0;
        return send(res, 200, { ok: true, seq: s.seq, signups: s.signups.filter((x) => x.seq > after) });
      }
      if (rest === 'admin/state' && method === 'PUT') {
        const body = await readJson(req);
        if (!body.ok) return fail(res, body.status, body.error);
        const b = body.value as Record<string, unknown> | null;
        if (!b || typeof b.open !== 'boolean' || !Array.isArray(b.names) || b.names.length > LIMITS.namesInState || !b.names.every((n) => typeof n === 'string' && n.length <= 200)) return fail(res, 400, 'bad-request');
        s.open = b.open;
        s.title = typeof b.title === 'string' ? b.title.slice(0, 80) : '';
        s.names = b.names as string[];
        s.seen = typeof b.seen === 'number' && b.seen >= 0 && b.seen <= s.seq ? b.seen : s.seen;
        // Applied sign-ups are no longer needed on the server.
        s.signups = s.signups.filter((x) => x.seq > s.seen);
        await save(s);
        return send(res, 200, { ok: true });
      }
      return fail(res, 404, 'not-found');
    }
    return fail(res, 404, 'not-found');
  }

  return {
    handle,
    purge,
    sessions,
    /** Wait for pending file writes (tests, shutdown). */
    flush: () => Promise.all(writes.values()).then(() => undefined),
  };
}
