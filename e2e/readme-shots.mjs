// Clean screenshots for the README (no toasts, sensible scroll positions).
// Usage: npm run build && npm run screenshots   → docs/screenshots/*.webp
// (PNG is kept if ImageMagick's `magick` is not installed.)
//
// It plays a knockout night through the real Kart Cup server (dist/server.mjs,
// started here with throwaway data), so phone sign-up, the Wi-Fi QR code and
// the station are part of the tour. All names are invented.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, root } from './lib.mjs';

const dir = path.join(root, 'docs', 'screenshots');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// ---- the Kart Cup server, as on the Pi (name, own Wi-Fi), with an example password
const PORT = 4191;
const SERVER = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(path.join(tmpdir(), 'kart-cup-shots-'));
const server = spawn(process.execPath, [path.join(root, 'dist', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, HOST_NAME: 'kartcup.lan', PUBLIC_URL: 'http://kartcup.lan', WIFI_SSID: 'Kart Cup', WIFI_PASSWORD: 'kartnight26' },
  stdio: 'ignore',
});
const stop = () => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
};
process.on('exit', stop);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${SERVER}/api/info`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 50) throw new Error('Kart Cup server did not start');
  await new Promise((r) => setTimeout(r, 100));
}

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const perm = (n) => {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const go = (hash = '') => page.goto(`${SERVER}/${hash ? '#/' + hash : ''}`);
// Let toasts (3.5 s) and entry animations finish before every shot.
const shot = async (name, { full = false, wait = 3900, target = page } = {}) => {
  await target.waitForTimeout(wait);
  await target.mouse.move(0, 0);
  await target.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
  console.log('•', name);
};

/** Console totals for the open heat: distinct Grand Prix point totals. */
async function fillTotals() {
  const inputs = page.locator('input.totals-input');
  const n = await inputs.count();
  const values = perm(n).map((v) => 8 + v * 6);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(values[i]));
}

/** Decide a sudden death on Home (a tie on a knockout cut line), if there is one. */
async function settleSuddenDeaths() {
  for (let g = 0; g < 5; g++) {
    await go();
    if (!(await page.locator('[data-testid=save-sudden]').count())) return;
    const tiles = page.locator('.sudden .tap-tile');
    const c = await tiles.count();
    for (let i = 0; i < c - 1; i++) await tiles.nth(i).click();
    await page.click('[data-testid=save-sudden]');
  }
}

async function playAll() {
  for (;;) {
    await go();
    const enter = page.locator('[data-testid=home-enter]');
    if (!(await enter.count())) break;
    await enter.click();
    await page.waitForSelector('input.totals-input');
    await fillTotals();
    await page.click('[data-testid=save-heat]');
    await page.waitForSelector('.result-entry', { state: 'detached' });
  }
  await settleSuddenDeaths();
}

async function nextRound() {
  await go();
  await page.click('[data-testid=generate-round]');
  await page.click('[data-testid=save-round]');
}

// ---- welcome and sign-up first
await go();
await shot('welcome', { wait: 1200 });
await page.click('[data-testid=new-tournament]');
await page.fill('[data-testid=setup-name]', 'Kart Cup Night');
await page.click('[data-testid=create-tournament]');
await go('players');
await page.click('[data-testid=quick-add]');
await page.fill(
  '[data-testid=quick-add-text]',
  ['Blitz Bianca', 'Turbo Tim', 'Drift Queen', 'Captain Kart', 'Nitro Nina', 'Shell Shock', 'Banana Ben', 'Lightning Lena', 'Max Boost', 'Coin Collector', 'Rainbow Rider', 'Sir Skids-a-Lot', 'Mini Turbo', 'Hairpin Hans', 'Slipstream Sam', 'Lucky Lou', 'Grip Grace', 'Apex Anton'].join('\n'),
);
await page.click('label.toggle:has([data-testid=quick-add-checkin])');
await page.click('[data-testid=quick-add-save]');
await go();
await page.click('[data-testid=phone-start]');
await page.waitForSelector('[data-testid=phone-code]');
const code = (await page.locator('[data-testid=phone-code]').textContent()).trim();
await shot('home-signup');
await page.click('[data-testid=phone-show-qr]');
await shot('qr-fullscreen', { wait: 800 });
await page.keyboard.press('Escape');

// A guest on a phone (the page the Wi-Fi QR code leads to)
const phoneCtx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
await phone.goto(`${SERVER}/#/s/${code}`);
await phone.fill('[data-testid=player-name]', 'Rocket Rosa');
await phone.fill('[data-testid=player-tag]', 'RR');
await phone.click('.color-choice >> nth=3');
await phone.evaluate(() => document.activeElement.blur());
await shot('phone-signup', { target: phone, wait: 800 });
await phone.click('[data-testid=guest-submit]');
await phone.waitForSelector('[data-testid=guest-welcome]');
await phoneCtx.close();

// The station on the Pi's own screen (mouse and keyboard)
const deskCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const desk = await deskCtx.newPage();
await desk.goto(`${SERVER}/#/desk`);
await desk.waitForSelector('.desk-side [data-testid=qr]');
await desk.keyboard.type('Chicane Charlie');
await shot('station', { target: desk, wait: 900 });
await desk.keyboard.press('Enter');
await desk.waitForSelector('[data-testid=guest-welcome]');
await deskCtx.close();

// The kiosk window, filled in but not sent
await go('join');
await page.fill('[data-testid=player-name]', 'Wheelie Willi');
await page.fill('[data-testid=player-tag]', 'WW');
await page.click('.color-choice >> nth=6');
await page.evaluate(() => {
  document.activeElement.blur();
  window.scrollTo(0, 0);
});
await shot('kiosk');
await page.click('[data-testid=kiosk-submit]');

// Wait until both remote sign-ups have arrived (21 players).
await go('players');
await page.waitForFunction(() => document.querySelectorAll('[data-testid=player-row]').length >= 21, null, { timeout: 15000 });

// ---- Start racing: format, race mode, plan; then the draw with controller numbers
await go();
await page.click('[data-testid=generate-round]');
await page.waitForSelector('[data-testid=start-continue]');
await shot('start-racing', { wait: 1200 });
await page.click('[data-testid=start-continue]');
await page.waitForSelector('[data-testid=save-round]');
await shot('round-preview', { wait: 900 });
await page.click('[data-testid=save-round]');

// The TV in its own window; the cup roulette on both screens
const big = await ctx.newPage();
await big.setViewportSize({ width: 1920, height: 1080 });
await big.goto(`${SERVER}/#/big`);
await go();
await page.waitForTimeout(3700);
await page.click('[data-testid=spin-cup]');
await big.waitForSelector('.big-spin', { timeout: 10000 });
await shot('cup-roulette', { wait: 1000 });
await shot('big-screen-roulette', { target: big, wait: 0 });
await big.waitForSelector('.big-spin', { state: 'detached', timeout: 15000 });
await shot('home-now-racing', { wait: 3000 });
await shot('big-screen-now-racing', { target: big, wait: 500 });

// Console totals for the first heat
await page.click('[data-testid=home-enter]');
await page.waitForSelector('input.totals-input');
await fillTotals();
await shot('result-entry', { wait: 800 });
await page.click('[data-testid=save-heat]');
await playAll();

// Round 2: seeded from the results, lucky losers wear the clover
await nextRound();
await go('rounds');
await shot('rounds');
await playAll();
await big.close();
const board = await ctx.newPage();
await board.setViewportSize({ width: 1920, height: 1080 });
await board.goto(`${SERVER}/#/big`);
await shot('big-screen-leaderboard', { target: board, wait: 1500 });
await board.close();

// The final, standings, bracket, podium
await nextRound();
await playAll();
await go('standings');
await page.click('[role=tab]:has-text("Knockout")');
await shot('standings', { wait: 1500 });
// A wide window, so the whole bracket up to the champion is in the picture.
await page.setViewportSize({ width: 1600, height: 900 });
await go('finals');
await shot('bracket', { full: true });
await page.setViewportSize({ width: 1366, height: 768 });
await go('podium');
await shot('podium', { wait: 4200 });

await page.click('[data-testid=lang]');
await go('standings');
await page.click('[role=tab]:has-text("K.-o.")').catch(() => {});
await shot('standings-german', { wait: 1200 });
await page.click('[data-testid=lang]');

await browser.close();
stop();

// Smaller files for the README: convert to WebP when ImageMagick is available.
for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
  try {
    const src = path.join(dir, f);
    execFileSync('magick', [src, '-resize', '1600x>', '-quality', '88', src.replace(/\.png$/, '.webp')]);
    rmSync(src);
  } catch {
    break;
  }
}
