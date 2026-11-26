// Puts everything a Raspberry Pi (or any device with Node.js 18+) needs into
// dist/kart-cup-server/: the app, the server, the Pi installer and its guide.
// Copy that folder to a USB stick or the SD card's boot partition.
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'kart-cup-server');
for (const f of ['index.html', 'server.mjs']) {
  if (!existsSync(path.join(root, 'dist', f))) {
    console.error(`dist/${f} is missing: run npm run build first.`);
    process.exit(1);
  }
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(path.join(root, 'dist', 'index.html'), path.join(out, 'index.html'));
copyFileSync(path.join(root, 'dist', 'server.mjs'), path.join(out, 'server.mjs'));
for (const f of ['install.sh', 'kart-cup.service', 'kart-cup-desk', 'kart-cup-desk.desktop', 'README.md']) copyFileSync(path.join(root, 'deploy', 'raspberry-pi', f), path.join(out, f));
chmodSync(path.join(out, 'install.sh'), 0o755);
chmodSync(path.join(out, 'kart-cup-desk'), 0o755);
console.log(`Packed ${path.relative(root, out)}/ (copy this folder to the Pi or any device with Node.js 18+).`);
