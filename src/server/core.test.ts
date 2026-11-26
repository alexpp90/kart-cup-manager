/// <reference types="node" />
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CODE_ALPHABET, wifiQrText } from '../shared/signup';
import { createApp, LIMITS } from './core';

let clock = 1_800_000_000_000;
const servers: Server[] = [];

async function start(dir = mkdtempSync(path.join(tmpdir(), 'kcm-')), extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const app = createApp({ dataDir: dir, html: '<html><head><title>Kart Cup Manager</title></head><body></body></html>', port: 8080, now: () => clock, addresses: () => ['http://192.168.1.50:8080'], ...extra });
  const server = createServer((req, res) => {
    // Tests choose the caller's address with a header (the real server uses the socket).
    const ip = req.headers['x-test-ip'];
    // fetch() won't let tests set Host; a header stands in for it.
    if (typeof req.headers['x-test-host'] === 'string') req.headers.host = req.headers['x-test-host'];
    if (typeof ip === 'string') Object.defineProperty(req.socket, 'remoteAddress', { value: ip, configurable: true });
    void app.handle(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, url: string, o: { body?: unknown; raw?: string; key?: string; ip?: string; type?: string; host?: string } = {}) => {
    const headers: Record<string, string> = { 'x-test-ip': o.ip ?? '192.168.1.20' };
    if (o.host) headers['x-test-host'] = o.host;
    if (o.body !== undefined || o.raw !== undefined) headers['content-type'] = o.type ?? 'application/json';
    if (o.key) headers.authorization = `Bearer ${o.key}`;
    const res = await fetch(base + url, { method, headers, redirect: 'manual', body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* html */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { app, dir, call };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function session(call: Awaited<ReturnType<typeof start>>['call'], ip = '192.168.1.10') {
  const r = await call('POST', '/api/sessions', { body: {}, ip });
  expect(r.status).toBe(201);
  return { code: r.json.code as string, key: r.json.adminKey as string };
}

describe('[REQ-HOST-001] the server serves the app and starts sessions', () => {
  it('[REQ-HOST-001] the app comes with the server marker and strict headers', async () => {
    const { call } = await start();
    const r = await call('GET', '/');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<meta name="kart-cup-server" content="1"></head>');
    expect(r.headers.get('content-security-policy')).toContain("connect-src 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await call('GET', '/etc/passwd')).status).toBe(404);
    expect((await call('GET', '/../../index.html')).status).toBe(200);
  });

  it('[REQ-HOST-001] a session has a 6-character code without look-alike characters and an admin key; info lists the join addresses', async () => {
    const { call } = await start();
    const r = await call('POST', '/api/sessions', { body: {} });
    expect(r.json.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    expect(String(r.json.adminKey).length).toBeGreaterThanOrEqual(22);
    expect((await call('GET', '/api/info')).json.bases).toEqual(['http://192.168.1.50:8080']);
  });

  it('[REQ-HOST-001] sessions are files written atomically and survive a restart; they expire', async () => {
    const first = await start();
    const { code, key } = await session(first.call);
    await first.call('POST', `/api/s/${code}/signups`, { body: { name: 'Ann', color: '#E60012' } });
    await first.app.flush();
    const files = readdirSync(path.join(first.dir, 'sessions'));
    expect(files).toEqual([`${code}.json`]);
    // Only a hash of the admin key is stored.
    expect(readFileSync(path.join(first.dir, 'sessions', files[0]), 'utf8')).not.toContain(key);
    const second = await start(first.dir);
    const pulled = await second.call('GET', `/api/s/${code}/admin/signups?after=0`, { key });
    expect((pulled.json.signups as { name: string }[]).map((s) => s.name)).toEqual(['Ann']);
    clock += 25 * 3600_000;
    expect((await second.call('GET', `/api/s/${code}`)).status).toBe(404);
    await second.app.flush();
    expect(readdirSync(path.join(first.dir, 'sessions'))).toEqual([]);
    clock -= 25 * 3600_000;
  });
});

describe('[REQ-HOST-002] sign-ups', () => {
  it('[REQ-HOST-002] a guest signs up; the organizer pulls with the key; taken names and closed registration are refused', async () => {
    const { call } = await start();
    const { code, key } = await session(call);
    expect((await call('GET', `/api/s/${code}`)).json).toMatchObject({ ok: true, open: true });
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'Lena', tag: 'LL', color: '#3cb44b' } })).json).toEqual({ ok: true, name: 'Lena', color: '#3CB44B' });
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: ' lena ' } })).json).toEqual({ ok: false, error: 'name-taken' });
    const pulled = await call('GET', `/api/s/${code}/admin/signups?after=0`, { key });
    expect(pulled.json.signups).toEqual([expect.objectContaining({ seq: 1, name: 'Lena', tag: 'LL', color: '#3CB44B', via: 'phone' })]);
    // The organizer reports its names (now including Lena) and that registration is closed.
    expect((await call('PUT', `/api/s/${code}/admin/state`, { key, body: { open: false, title: 'Kart Night', names: ['Lena', 'Tom'], seen: 1 } })).status).toBe(200);
    expect((await call('GET', `/api/s/${code}`)).json).toMatchObject({ title: 'Kart Night', open: false });
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'Mia' } })).json.error).toBe('closed');
    await call('PUT', `/api/s/${code}/admin/state`, { key, body: { open: true, names: ['Lena', 'Tom'], seen: 1 } });
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'TOM' } })).json.error).toBe('name-taken');
    expect((await call('GET', `/api/s/${code}/admin/signups?after=1`, { key })).json.signups).toEqual([]);
  });

  it('[REQ-HOST-002] the organizer can end the session', async () => {
    const { call } = await start();
    const { code, key } = await session(call);
    expect((await call('DELETE', `/api/s/${code}`)).status).toBe(401);
    expect((await call('DELETE', `/api/s/${code}`, { key })).status).toBe(200);
    expect((await call('GET', `/api/s/${code}`)).status).toBe(404);
  });

  it('[REQ-HOST-003] the station on the server screen finds the newest session; other devices may not ask', async () => {
    const { call } = await start();
    expect((await call('GET', '/api/local/session', { ip: '127.0.0.1' })).status).toBe(404);
    const { code, key } = await session(call);
    expect((await call('GET', '/api/local/session', { ip: '127.0.0.1' })).json).toMatchObject({ code });
    expect((await call('GET', '/api/local/session', { ip: '192.168.1.20' })).status).toBe(403);
    // "desk" is only believed from the server itself.
    await call('POST', `/api/s/${code}/signups`, { body: { name: 'Desk Dan', via: 'desk' }, ip: '127.0.0.1' });
    await call('POST', `/api/s/${code}/signups`, { body: { name: 'Fake Desk', via: 'desk' }, ip: '192.168.1.30' });
    const pulled = (await call('GET', `/api/s/${code}/admin/signups?after=0`, { key })).json.signups as { name: string; via: string }[];
    expect(pulled.map((x) => [x.name, x.via])).toEqual([
      ['Desk Dan', 'desk'],
      ['Fake Desk', 'phone'],
    ]);
  });
});

describe('[REQ-SEC-001] everything a guest sends is treated as hostile', () => {
  it('[REQ-SEC-001] control and bidi characters are stripped; length counts characters as people see them', async () => {
    const { call } = await start();
    const { code } = await session(call);
    const r = await call('POST', `/api/s/${code}/signups`, { body: { name: '‮Admin\u0000 ​ Bob', tag: 'x⁦y' } });
    expect(r.json.name).toBe('Admin Bob');
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: '🏎️'.repeat(24) } })).status).toBe(201);
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'x'.repeat(25) } })).json.error).toBe('name-too-long');
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'Ok', tag: 'TOOLONGTAG' } })).json.error).toBe('tag-too-long');
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: '   ' } })).json.error).toBe('name-required');
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'Eve', color: 'url(javascript:x)' } })).json.error).toBe('bad-color');
    expect((await call('POST', `/api/s/${code}/signups`, { body: ['Eve'] })).json.error).toBe('bad-request');
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 42 } })).json.error).toBe('bad-request');
    expect((await call('POST', `/api/s/${code}/signups`, { raw: 'name=Eve', type: 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await call('POST', `/api/s/${code}/signups`, { raw: '{oops' })).status).toBe(400);
    expect((await call('POST', `/api/s/${code}/signups`, { raw: JSON.stringify({ name: 'Big', pad: 'x'.repeat(LIMITS.bodyBytes) }) })).status).toBe(413);
  });

  it('[REQ-SEC-001] the admin key is required and checked; guests never see it', async () => {
    const { call } = await start();
    const { code, key } = await session(call);
    expect((await call('GET', `/api/s/${code}/admin/signups`)).status).toBe(401);
    expect((await call('GET', `/api/s/${code}/admin/signups`, { key: key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A') })).status).toBe(401);
    const guestView = await call('GET', `/api/s/${code}`);
    expect(JSON.stringify(guestView.json)).not.toContain(key);
    expect((await call('PUT', `/api/s/${code}/admin/state`, { key, body: { open: 'yes', names: [] } })).status).toBe(400);
    expect((await call('PUT', `/api/s/${code}/admin/state`, { key, body: { open: true, names: Array(500).fill('x') } })).status).toBe(400);
  });
});

describe('[REQ-SEC-002] rate limits and caps', () => {
  it('[REQ-SEC-002] 10 sign-ups per minute per device, 30 per session; the limit resets', async () => {
    const { call } = await start();
    const { code } = await session(call);
    for (let i = 0; i < 10; i++) expect((await call('POST', `/api/s/${code}/signups`, { body: { name: `A${i}` }, ip: '10.0.0.1' })).status).toBe(201);
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'A10' }, ip: '10.0.0.1' })).status).toBe(429);
    for (let i = 0; i < 20; i++) await call('POST', `/api/s/${code}/signups`, { body: { name: `B${i}` }, ip: `10.0.1.${i}` });
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'C1' }, ip: '10.0.2.1' })).status).toBe(429);
    clock += 61_000;
    expect((await call('POST', `/api/s/${code}/signups`, { body: { name: 'A10' }, ip: '10.0.0.1' })).status).toBe(201);
  });

  it('[REQ-SEC-002] guessing codes is cut off after 20 wrong tries in 10 minutes', async () => {
    const { call } = await start();
    const { code } = await session(call);
    for (let i = 0; i < 20; i++) expect((await call('GET', '/api/s/ZZZZZZ', { ip: '10.9.9.9' })).status).toBe(404);
    expect((await call('GET', `/api/s/${code}`, { ip: '10.9.9.9' })).status).toBe(429);
    expect((await call('GET', `/api/s/${code}`, { ip: '10.9.9.8' })).status).toBe(200);
    clock += 601_000;
    expect((await call('GET', `/api/s/${code}`, { ip: '10.9.9.9' })).status).toBe(200);
  });

  it('[REQ-SEC-002] at most 5 new sessions per hour per device and a cap on open sessions; 64 players per session', async () => {
    const { call } = await start(undefined, { maxSessions: 7 });
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/sessions', { body: {}, ip: '10.1.1.1' })).status).toBe(201);
    expect((await call('POST', '/api/sessions', { body: {}, ip: '10.1.1.1' })).status).toBe(429);
    await session(call, '10.1.1.2');
    const last = await session(call, '10.1.1.3');
    expect((await call('POST', '/api/sessions', { body: {}, ip: '10.1.1.4' })).status).toBe(503);
    const names = Array.from({ length: 64 }, (_, i) => `P${i}`);
    await call('PUT', `/api/s/${last.code}/admin/state`, { key: last.key, body: { open: true, names } });
    expect((await call('POST', `/api/s/${last.code}/signups`, { body: { name: 'One more' } })).json.error).toBe('full');
  });
});

describe('[REQ-SEC-003] no outgoing requests, no IP logging', () => {
  it('[REQ-SEC-003] the server code never calls out and never logs addresses of callers', () => {
    const src = ['core.ts', 'main.ts'].map((f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).join('\n');
    expect(src).not.toMatch(/\bfetch\(|node:https|http\.request|https\.request|new WebSocket|node:net\b|node:dgram/);
    expect(src).not.toMatch(/console\.\w+\([^)]*remoteAddress/);
    expect(src).not.toMatch(/console\.\w+\([^)]*\bip\b/);
  });
});

describe('[REQ-HOST-007][REQ-HOST-008] the Pi\'s own Wi-Fi: captive sign-up, names, Wi-Fi QR', () => {
  const pi = { hostName: 'kartcup.lan', port: 80, captive: true, wifi: { ssid: 'Kart Cup', password: 'abc;de:f' } };

  it('[REQ-HOST-007] phones\' connection checks and other hosts are sent to /join, which leads to the newest sign-up', async () => {
    const { call } = await start(undefined, pi);
    for (const [host, path] of [['connectivitycheck.gstatic.com', '/generate_204'], ['captive.apple.com', '/hotspot-detect.html'], ['www.msftconnecttest.com', '/connecttest.txt'], ['example.org', '/']]) {
      const r = await call('GET', path, { host });
      expect(r.status, host).toBe(302);
      expect(r.headers.get('location')).toBe('http://kartcup.lan/join');
    }
    // Before a session exists /join says so; then it leads to the newest one.
    expect((await call('GET', '/join', { host: 'kartcup.lan' })).headers.get('location')).toBe('/#/s');
    const { code } = await session(call);
    expect((await call('GET', '/join', { host: 'kartcup.lan' })).headers.get('location')).toBe(`/#/s/${code}`);
    // The server's own names and addresses are served normally.
    for (const host of ['kartcup.lan', 'kartcup.local', '10.42.0.1', 'localhost:8080']) expect((await call('GET', '/', { host })).status, host).toBe(200);
    expect((await call('GET', `/api/s/${code}`, { host: 'kartcup.lan' })).status).toBe(200);
  });

  it('[REQ-HOST-008] join links use the name, never an IP; the Wi-Fi is published for the QR code', async () => {
    const { call } = await start(undefined, pi);
    const info = await call('GET', '/api/info', { host: 'kartcup.lan' });
    expect(info.json).toMatchObject({ bases: ['http://kartcup.lan'], host: 'kartcup.lan', wifi: { ssid: 'Kart Cup', password: 'abc;de:f' }, captive: true });
    const s = await call('POST', '/api/sessions', { body: {}, host: 'kartcup.lan' });
    expect(s.json.bases).toEqual(['http://kartcup.lan']);
    expect(wifiQrText('Kart Cup', 'abc;de:f')).toBe('WIFI:T:WPA;S:Kart Cup;P:abc\\;de\\:f;;');
    expect(wifiQrText('Open "Net"', '')).toBe('WIFI:T:nopass;S:Open \\"Net\\";;');
    // Without captive mode nothing is redirected.
    const plain = await start();
    expect((await plain.call('GET', '/', { host: 'example.org' })).status).toBe(200);
  });
});
