/// <reference types="node" />
// Start: `node server.mjs` next to index.html. Settings by environment:
//   PORT (8080), HOST (0.0.0.0), DATA_DIR (./kart-cup-data next to server.mjs),
//   PUBLIC_URL (fixed base for join links, e.g. http://192.168.178.50:8080),
//   MAX_SESSION_HOURS (72), MAX_SESSIONS (20).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './core';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const htmlPath = process.env.APP_HTML ?? path.join(here, 'index.html');

const addresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${port}`);

let html: string;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch {
  console.error(`Kart Cup server: cannot read ${htmlPath}. Put index.html next to server.mjs or set APP_HTML.`);
  process.exit(1);
}

const app = createApp({
  dataDir: process.env.DATA_DIR ?? path.join(here, 'kart-cup-data'),
  html,
  port,
  publicUrl: process.env.PUBLIC_URL || undefined,
  maxSessionHours: Number(process.env.MAX_SESSION_HOURS ?? 72),
  maxSessions: Number(process.env.MAX_SESSIONS ?? 20),
  addresses,
});

const server = createServer((req, res) => {
  app.handle(req, res).catch((e) => {
    console.error('Kart Cup server error:', e instanceof Error ? e.message : e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"ok":false,"error":"server"}');
  });
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => {
  const list = addresses();
  console.log(`Kart Cup server is running on port ${port}.`);
  console.log(`  On this device:  http://localhost:${port}`);
  for (const a of list) console.log(`  On the network:  ${a}`);
  if (!list.length) console.log('  (no network address found: is the device on the Wi-Fi or a cable?)');
});
setInterval(() => void app.purge(), 3600_000).unref();
const stop = () => {
  server.close();
  void app.flush().then(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
