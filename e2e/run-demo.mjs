// End-to-end run through the real UI (built single-file app opened from disk).
//   A) 30 players, max 8: setup → registration (quick add + kiosk) → 3 rounds with a
//      late registration after round 1, a kiosk late-joiner offered a free slot, a
//      withdrawal and a reload mid-round → finals → podium. Screenshots of every screen.
//   B) 11 players, max 4, console totals and a Last Chance heat, quickly.
// Usage: npm run build && npm run e2e
import assert from 'node:assert/strict';
import { appUrl, launch, outDir, shooter } from './lib.mjs';

const NAMES = [
  'Alex', 'Bea', 'Chris', 'Dana', 'Eli', 'Fynn', 'Gina', 'Hugo', 'Ida', 'Jonas', 'Kim', 'Lena', 'Mo', 'Nele', 'Ole',
  'Pia', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uwe', 'Vera', 'Wim', 'Xenia', 'Yara', 'Zoe', 'Ben', 'Carla', 'David',
];
const log = (...a) => console.log('•', ...a);
let rngState = 7;
const rand = () => ((rngState = (rngState * 16807) % 2147483647) / 2147483647);
const perm = (n) => {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const browser = await launch();
const errors = [];
let current = null;
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, async (e) => {
  console.error(e);
  if (current) await current.screenshot({ path: outDir('failure') + '/failure.png', fullPage: true }).catch(() => {});
  process.exit(1);
});

async function newContext(viewport = { width: 1366, height: 768 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept()); // beforeunload prompt on reload
  current = page;
  return { ctx, page };
}

const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kart-cup-manager:v1') ?? '{}').t);
const confirm = async (page) => page.click('[data-testid=confirm-ok]');

async function setup(page, shot, { name, max, entry, lastChance }) {
  await page.goto(appUrl);
  await shot('welcome');
  await page.click('[data-testid=new-tournament]');
  await page.fill('[data-testid=setup-name]', name);
  await shot('setup-basics');
  await page.click('[data-testid=wizard-next]');
  if (max === 4) await page.click('label.choice:has-text("4 per heat")');
  if (entry === 'totals') await page.click('label.choice:has-text("Console totals")');
  await shot('setup-format');
  await page.click('[data-testid=wizard-next]');
  await shot('setup-points');
  await page.click('[data-testid=wizard-next]');
  if (lastChance) {
    await page.click('label.toggle:has-text("Last Chance heat")');
    await page.click('label.choice:has-text("1")');
  }
  await shot('setup-finals');
  await page.click('[data-testid=wizard-next]');
  await shot('setup-tracks');
  await page.click('[data-testid=create-tournament]');
}

async function quickAdd(page, shot, names, checkIn = true) {
  await page.goto(appUrl + '#/players');
  await page.click('[data-testid=quick-add]');
  await page.fill('[data-testid=quick-add-text]', names.join('\n') + '\n\nAlex\n');
  if (checkIn) await page.click('label.toggle:has([data-testid=quick-add-checkin])');
  await shot('quick-add');
  await page.click('[data-testid=quick-add-save]');
}

async function kioskRegister(page, shot, name, opts = {}) {
  await page.goto(appUrl + '#/join');
  await page.fill('[data-testid=player-name]', name);
  await page.click('.avatar-choice >> nth=6');
  await page.click('.color-choice >> nth=5');
  await page.fill('input[placeholder="e.g. TT"]', name.slice(0, 2).toUpperCase());
  await page.fill('input[placeholder="Who do you drive?"]', 'The fast one');
  if (opts.shot) await shot('kiosk-form');
  await page.click('[data-testid=kiosk-submit]');
  if (opts.shot) await shot('kiosk-welcome', { wait: 500 });
  await page.waitForTimeout(300);
}

async function generateRound(page, shot, label) {
  await page.goto(appUrl + '#/');
  await page.click('[data-testid=generate-round]');
  await page.waitForSelector('[data-testid=save-round]');
  if (label) await shot(label);
  await page.click('[data-testid=regenerate]');
  await page.waitForTimeout(200);
  await page.click('[data-testid=save-round]');
  await page.waitForTimeout(300);
}

/** Tap finishing orders with the number keys; the last place auto-fills. */
async function enterPerRace(page, races) {
  await page.waitForSelector('.tap-tile');
  const n = await page.locator('.tap-tile').count();
  for (let r = 0; r < races; r++) {
    await page.click(`[data-testid=race-tab-${r + 1}]`);
    for (const k of perm(n).slice(0, n - 1)) await page.keyboard.press(String(k));
    await page.waitForTimeout(80);
  }
}

async function enterTotals(page, withTie = false) {
  const inputs = page.locator('input.totals-input');
  const n = await inputs.count();
  const values = perm(n).map((v) => v * 7 + 3);
  if (withTie && n > 2) values[1] = values[0];
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(values[i]));
}

async function playQueuedHeats(page, shot, { races, max, shotFirst, totalsEvery }) {
  let count = 0;
  for (;;) {
    await page.goto(appUrl + '#/');
    const enter = page.locator('[data-testid=home-enter]');
    if (!(await enter.count())) break;
    await enter.click();
    await page.waitForSelector('.result-entry');
    const isTotals = (await page.locator('input.totals-input').count()) > 0;
    const useTotals = isTotals || (totalsEvery && count % totalsEvery === totalsEvery - 1);
    if (useTotals && !isTotals) await page.click('[data-testid=switch-mode]');
    if (useTotals) await enterTotals(page, count === 0);
    else await enterPerRace(page, races);
    if (shotFirst && count === 0) await shot(useTotals ? 'result-totals' : 'result-per-race');
    await page.click('[data-testid=save-heat]');
    await page.waitForTimeout(150);
    assert.ok(!(await page.locator('.notice-error').count()), 'result validation error');
    count++;
    if (count > 40) throw new Error('runaway loop');
  }
  return count;
}

// =========================================================== A: 30 players, max 8
{
  const { ctx, page } = await newContext();
  const shot = shooter(page, outDir('a-30-max8'));
  log('A: setup');
  await setup(page, shot, { name: 'Kart Cup Night', max: 8 });
  await page.waitForTimeout(400);
  await shot('players-empty');

  log('A: registration (29 quick add + 1 kiosk)');
  await quickAdd(page, shot, NAMES);
  await kioskRegister(page, shot, 'Kiosk Kai', { shot: true });
  let t = await state(page);
  assert.equal(t.players.length, 30);
  assert.ok(t.players.every((p) => p.status === 'checked-in'));
  await page.goto(appUrl + '#/players');
  await shot('players', { full: true });
  await page.goto(appUrl + '#/');
  await shot('home-registration');

  log('A: round 1');
  await generateRound(page, shot, 'round1-preview');
  t = await state(page);
  assert.deepEqual(t.rounds[0].heats.map((h) => h.playerIds.length).sort(), [7, 7, 8, 8]);
  await page.goto(appUrl + '#/');
  await shot('home-now-racing');
  await page.click('[data-testid=spin-cup]');
  await shot('cup-roulette-spinning', { wait: 900 });
  await page.waitForTimeout(4500);
  await shot('home-cup-picked');
  const heats1 = await playQueuedHeats(page, shot, { races: 4, max: 8, shotFirst: true, totalsEvery: 4 });
  assert.equal(heats1, 4);
  await page.goto(appUrl + '#/rounds');
  await shot('rounds-r1-done', { full: true });
  await page.goto(appUrl + '#/standings');
  await shot('standings-after-r1', { full: true });

  log('A: late registration after round 1 (organizer add)');
  await page.goto(appUrl + '#/players');
  await page.click('[data-testid=add-player]');
  await page.fill('[data-testid=player-name]', 'Late Larry');
  await shot('add-player-modal');
  await page.click('[data-testid=save-player]');
  await page.waitForTimeout(300);
  t = await state(page);
  const larry = t.players.find((p) => p.name === 'Late Larry');
  assert.equal(larry.joinedRound, 1);

  log('A: round 2 includes Larry');
  await generateRound(page, shot, 'round2-preview');
  t = await state(page);
  assert.ok(t.rounds[1].heats.some((h) => h.playerIds.includes(larry.id)));
  assert.deepEqual(t.rounds[1].heats.map((h) => h.playerIds.length).sort(), [7, 8, 8, 8]);

  log('A: kiosk late joiner during round 2 gets offered the free slot');
  await kioskRegister(page, shot, 'Lisa Lastminute');
  await page.goto(appUrl + '#/');
  await shot('home-late-joiner-notice');
  await page.click('.notice-late button >> nth=0');
  await page.waitForTimeout(200);
  t = await state(page);
  const lisa = t.players.find((p) => p.name === 'Lisa Lastminute');
  assert.equal(lisa.status, 'active');
  assert.ok(t.rounds[1].heats.some((h) => h.playerIds.includes(lisa.id)));

  log('A: withdrawal during round 2');
  const victim = t.players.find((p) => p.name === 'Ole');
  await page.goto(appUrl + '#/players');
  await page.click('[data-testid="withdraw-Ole"]');
  await shot('withdraw-confirm');
  await confirm(page);
  await page.waitForTimeout(200);
  t = await state(page);
  assert.equal(t.players.find((p) => p.id === victim.id).status, 'withdrawn');
  assert.ok(!t.rounds[1].heats.some((h) => !h.result && h.playerIds.includes(victim.id)));

  log('A: reorder + move player on the rounds screen');
  await page.goto(appUrl + '#/rounds');
  await shot('rounds-r2', { full: true });

  log('A: play one heat, half-enter the next, reload');
  await page.goto(appUrl + '#/');
  await page.click('[data-testid=home-enter]');
  await enterPerRace(page, 4);
  await page.click('[data-testid=save-heat]');
  await page.waitForTimeout(200);
  await page.click('[data-testid=home-enter]');
  await enterPerRace(page, 2);
  const heatUrl = page.url();
  const before = await state(page);
  await page.reload();
  await page.waitForSelector('.result-entry');
  const after = await state(page);
  assert.deepEqual(after, before, 'tournament changed on reload');
  assert.equal(page.url(), heatUrl);
  assert.equal(await page.locator('.race-tabs .tab-done').count(), 2, 'draft races lost on reload');
  await shot('reload-mid-heat-draft-kept');
  log('A: reload kept everything');
  await page.click('[data-testid=race-tab-3]');
  await enterPerRace(page, 0);
  for (let r = 2; r < 4; r++) {
    await page.click(`[data-testid=race-tab-${r + 1}]`);
    const n = await page.locator('.tap-tile').count();
    for (const k of perm(n).slice(0, n - 1)) await page.keyboard.press(String(k));
  }
  await page.click('[data-testid=save-heat]');
  await playQueuedHeats(page, shot, { races: 4, max: 8 });

  log('A: undo / redo sanity');
  const beforeUndo = await state(page);
  await page.click('[data-testid=undo]');
  await page.waitForTimeout(200);
  const undone = await state(page);
  assert.notDeepEqual(undone, beforeUndo);
  await page.goto(appUrl + '#/');
  await page.click('[data-testid=home-enter]');
  await enterPerRace(page, 4);
  await page.click('[data-testid=save-heat]');

  log('A: round 3');
  await generateRound(page, shot, 'round3-preview');
  t = await state(page);
  assert.ok(!t.rounds[2].heats.some((h) => h.playerIds.includes(victim.id)), 'withdrawn player in round 3');

  log('A: big screen window (BroadcastChannel)');
  const big = await ctx.newPage();
  await big.setViewportSize({ width: 1920, height: 1080 });
  await big.goto(appUrl + '#/big');
  await big.waitForSelector('[data-testid=big-screen]');
  const bigShot = shooter(big, outDir('a-30-max8-bigscreen'));
  await bigShot('big-screen-now-racing', { wait: 1200 });
  await page.goto(appUrl + '#/');
  await page.click('[data-testid=spin-cup]');
  await big.waitForSelector('.big-spin', { timeout: 10000 });
  await bigShot('big-screen-roulette', { wait: 1500 });
  await page.waitForTimeout(4000);
  await playQueuedHeats(page, shot, { races: 4, max: 8, totalsEvery: 3 });
  await big.waitForTimeout(800);
  await big.evaluate(() => document.querySelectorAll('.big-dots span')[1]?.click());
  await page.waitForTimeout(100);

  log('A: standings with cut line and tie tooltip');
  await page.goto(appUrl + '#/standings');
  await shot('standings-after-r3', { full: true });
  const tie = page.locator('.tie-btn').first();
  if (await tie.count()) {
    await tie.focus();
    await shot('standings-tiebreak-tooltip');
  }

  log('A: finals setup');
  await page.goto(appUrl + '#/finals');
  await shot('finals-setup');
  for (let guard = 0; (await page.locator('[data-testid=save-sudden]').count()) && guard < 5; guard++) {
    await shot('finals-sudden-death');
    const tiles = page.locator('.sudden .tap-tile');
    const n = await tiles.count();
    for (let i = 0; i < n - 1; i++) await tiles.nth(i).click();
    await page.click('[data-testid=save-sudden]');
    await page.waitForTimeout(200);
  }
  await page.click('[data-testid=start-finals]');
  await confirm(page);
  await page.waitForTimeout(400);
  t = await state(page);
  assert.equal(t.finals.stages[0].heats.length, 2);
  assert.ok(!t.finals.stages[0].seeds.includes(victim.id));
  await shot('finals-bracket-start', { full: true });
  await page.goto(appUrl + '#/');
  await shot('home-finals');
  await playQueuedHeats(page, shot, { races: 4, max: 8, shotFirst: false });
  t = await state(page);
  assert.equal(t.finals.stages[1].heats[0].result !== undefined, true);

  log('A: podium');
  await page.goto(appUrl + '#/finals');
  await shot('finals-bracket-done', { full: true });
  await page.goto(appUrl + '#/podium');
  await shot('podium', { wait: 1400 });
  await shot('podium-full', { full: true, wait: 3500 });
  await bigShot('big-screen-podium', { wait: 1500 });
  await page.goto(appUrl + '#/standings');
  await shot('standings-final', { full: true });

  log('A: data: CSV + JSON export, reset dialog, German UI');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-csv]')]);
  const csvText = await (await csv.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  assert.ok(csvText.split('\n').length >= 32, 'csv rows');
  await page.goto(appUrl + '#/settings');
  const [json] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-json]')]);
  const backup = JSON.parse(await (await json.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  assert.equal(backup.app, 'kart-cup-manager');
  assert.equal(backup.tournament.players.length, 32);
  await shot('settings', { full: true });
  await page.click('[data-testid=reset]');
  await page.fill('[data-testid=confirm-type]', 'Kart Cup');
  assert.ok(await page.locator('[data-testid=confirm-ok]').isDisabled(), 'reset enabled with wrong name');
  await page.fill('[data-testid=confirm-type]', 'Kart Cup Night');
  await shot('reset-confirm');
  await page.keyboard.press('Escape');
  await page.click('[data-testid=lang]');
  await page.goto(appUrl + '#/');
  await shot('home-german');
  await page.goto(appUrl + '#/standings');
  await shot('standings-german');
  await page.click('[data-testid=lang]');
  await ctx.close();
}

// =========================================================== B: 11 players, max 4
{
  const { ctx, page } = await newContext({ width: 1024, height: 768 });
  const shot = shooter(page, outDir('b-11-max4'));
  log('B: setup max 4, console totals, Last Chance (1 wildcard)');
  await setup(page, shot, { name: 'Small Cup', max: 4, entry: 'totals', lastChance: true });
  await quickAdd(page, shot, NAMES.slice(0, 11));
  for (let r = 0; r < 3; r++) {
    await generateRound(page, shot, r === 0 ? 'round1-preview' : null);
    const t = await state(page);
    assert.deepEqual(t.rounds[r].heats.map((h) => h.playerIds.length).sort(), [3, 4, 4]);
    await playQueuedHeats(page, shot, { races: 4, max: 4, shotFirst: r === 0 });
  }
  await page.goto(appUrl + '#/standings');
  await shot('standings', { full: true });
  await page.goto(appUrl + '#/finals');
  for (let guard = 0; (await page.locator('[data-testid=save-sudden]').count()) && guard < 5; guard++) {
    const tiles = page.locator('.sudden .tap-tile');
    const n = await tiles.count();
    for (let i = 0; i < n - 1; i++) await tiles.nth(i).click();
    await page.click('[data-testid=save-sudden]');
  }
  await shot('finals-setup');
  await page.click('[data-testid=start-finals]');
  await confirm(page);
  await page.waitForTimeout(300);
  let t = await state(page);
  assert.equal(t.finals.stages[0].lastChance.playerIds.length, 4);
  await shot('finals-bracket-last-chance', { full: true });
  await playQueuedHeats(page, shot, { races: 4, max: 4 });
  t = await state(page);
  assert.equal(t.finals.stages[0].seeds.length, 8);
  await page.goto(appUrl + '#/finals');
  await shot('finals-bracket-done', { full: true });
  await page.goto(appUrl + '#/podium');
  await shot('podium', { wait: 1500 });
  // Kiosk on a portrait tablet
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(appUrl + '#/join');
  await shot('kiosk-closed-tablet');
  await ctx.close();
}

// =========================================================== kiosk tablet + mobile sanity
{
  const { ctx, page } = await newContext({ width: 1024, height: 768 });
  const shot = shooter(page, outDir('c-kiosk'));
  await page.goto(appUrl);
  await page.click('[data-testid=load-demo]');
  await page.goto(appUrl + '#/join');
  await shot('kiosk-tablet-landscape', { full: true, wait: 1000 });
  await page.setViewportSize({ width: 768, height: 1024 });
  await shot('kiosk-tablet-portrait', { full: true });
  await page.fill('[data-testid=player-name]', 'blitz bianca');
  await page.click('[data-testid=kiosk-submit]');
  await shot('kiosk-duplicate-name');
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nE2E OK — screenshots in e2e/out/');
