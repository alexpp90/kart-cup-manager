// Clean screenshots for the README (no toasts, sensible scroll positions).
// Usage: npm run build && npm run screenshots   → docs/screenshots/*.webp
// (PNG is kept if ImageMagick's `magick` is not installed.)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { appUrl, launch, root } from './lib.mjs';

const dir = path.join(root, 'docs', 'screenshots');
mkdirSync(dir, { recursive: true });
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
// Let toasts (3.5 s) and entry animations finish before every shot.
const shot = async (name, { full = false, wait = 3900, target = page } = {}) => {
  await target.waitForTimeout(wait);
  await target.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
  console.log('•', name);
};

async function tapRaces(races) {
  await page.waitForSelector('.tap-tile');
  const n = await page.locator('.tap-tile').count();
  for (let r = 0; r < races; r++) {
    await page.click(`[data-testid=race-tab-${r + 1}]`);
    for (const k of perm(n).slice(0, n - 1)) await page.keyboard.press(String(k));
  }
}

async function playAll() {
  for (;;) {
    await page.goto(appUrl + '#/');
    const enter = page.locator('[data-testid=home-enter]');
    if (!(await enter.count())) return;
    await enter.click();
    await tapRaces(4);
    await page.click('[data-testid=save-heat]');
    await page.waitForTimeout(150);
  }
}

async function nextRound() {
  await page.goto(appUrl + '#/');
  await page.click('[data-testid=generate-round]');
  await page.click('[data-testid=save-round]');
}

await page.goto(appUrl);
await shot('welcome', { wait: 1200 });
await page.click('[data-testid=load-demo]');

// Kiosk with a filled-in racer card
await page.goto(appUrl + '#/join');
await page.fill('[data-testid=player-name]', 'Turbo Tina');
await page.fill('input[placeholder="e.g. TT"]', 'TT');
await page.fill('input[placeholder="Who do you drive?"]', 'The green dino');
await page.click('.avatar-choice >> nth=16');
await page.click('.color-choice >> nth=3');
await page.evaluate(() => {
  document.activeElement.blur();
  window.scrollTo(0, 0);
});
await shot('kiosk', { wait: 1500 });

// Round 2: preview, now racing with a spun cup, result entry
await page.goto(appUrl + '#/');
await page.click('[data-testid=generate-round]');
await page.waitForSelector('[data-testid=save-round]');
await shot('round-preview', { wait: 900 });
await page.click('[data-testid=save-round]');
await page.goto(appUrl + '#/');
await page.waitForTimeout(3700);
await page.click('[data-testid=spin-cup]');
await shot('cup-roulette', { wait: 1000 });
await page.waitForTimeout(4500);
await shot('home-now-racing');
await page.click('[data-testid=home-enter]');
await tapRaces(2);
await page.click('[data-testid=race-tab-3]');
const n = await page.locator('.tap-tile').count();
for (const k of perm(n).slice(0, 3)) await page.keyboard.press(String(k));
await page.mouse.move(0, 0);
await shot('result-entry', { wait: 800 });
await page.click('[data-testid=race-tab-3]');
await page.click('text=Clear race');
await tapRaces(4);
await page.click('[data-testid=save-heat]');
await playAll();
await page.goto(appUrl + '#/rounds');
await shot('rounds');

await nextRound();
await playAll();

// Big screen in its own window
const big = await ctx.newPage();
await big.setViewportSize({ width: 1920, height: 1080 });
await big.goto(appUrl + '#/big');
await shot('big-screen-leaderboard', { target: big, wait: 1500 });

await page.goto(appUrl + '#/standings');
await page.locator('.tie-btn').first().focus().catch(() => {});
await shot('standings', { wait: 1500 });

await page.goto(appUrl + '#/finals');
for (let g = 0; (await page.locator('[data-testid=save-sudden]').count()) && g < 5; g++) {
  const tiles = page.locator('.sudden .tap-tile');
  const c = await tiles.count();
  for (let i = 0; i < c - 1; i++) await tiles.nth(i).click();
  await page.click('[data-testid=save-sudden]');
}
await shot('finals-setup', { wait: 1200 });
await page.click('[data-testid=start-finals]');
await page.click('[data-testid=confirm-ok]');
await page.goto(appUrl + '#/');
await page.click('[data-testid=spin-cup]');
await big.waitForSelector('.big-spin', { timeout: 10000 });
await shot('big-screen-roulette', { target: big, wait: 1200 });
await big.waitForSelector('.big-spin', { state: 'detached', timeout: 15000 });
await shot('big-screen-now-racing', { target: big, wait: 1500 });
await playAll();
await page.goto(appUrl + '#/finals');
await shot('bracket', { full: true });
await page.goto(appUrl + '#/podium');
await shot('podium', { wait: 4200 });

await page.click('[data-testid=lang]');
await page.goto(appUrl + '#/standings');
await shot('standings-german', { wait: 1200 });
await page.click('[data-testid=lang]');

await browser.close();

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
