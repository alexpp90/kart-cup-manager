// The full organizer journey through the real UI, run from the built single file
// on disk: 30 players at max 8, three rounds with a late sign-up, a kiosk late
// joiner, a withdrawal and a reload mid-heat, then finals, podium, data and German.
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import {
  diskUrl as url, enterPerRace, enterTotals, expect, generateRound, kioskRegister, NAMES, permuter, playQueue, quickAdd,
  openRoundPreview, settleSuddenDeaths, shot, state, watchErrors,
} from './helpers';

const test = base;
test.describe.configure({ mode: 'serial' });

let ctx: BrowserContext;
let page: Page;
let errors: string[];
const perm = permuter(7);
const OUT = 'journey-30-max8';

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page = await ctx.newPage();
  errors = watchErrors(page);
  page.on('dialog', (d) => void d.accept());
});
test.afterEach(() => expect(errors, 'browser errors').toEqual([]));
test.afterAll(async () => ctx.close());

test.describe('[journey] 30 players, max 8', () => {
  test('[REQ-UI-030] a new tournament needs only a name; sign-up opens at once; the rest is in Settings', async () => {
    await page.goto(url());
    await page.click('[data-testid=new-tournament]');
    await expect(page.locator('.wizard-step')).toHaveCount(0);
    await page.fill('[data-testid=setup-name]', 'Kart Cup Night');
    await page.click('[data-testid=create-tournament]');
    // Home: registration is open, the next step is "Start racing".
    await expect(page.locator('[data-testid=generate-round]')).toHaveText('Start racing');
    await expect(page.locator('.now-card')).toContainText('Registration is open');
    // Scoring and the other details live in Settings.
    await page.goto(url('settings'));
    await expect(page.locator('[data-testid=entry-totals]')).toBeVisible();
    await page.click('[data-testid=entry-per-race]');
    await expect(page.locator('.points-table.is-active .points-cell input').first()).toHaveValue('15');
    await page.click('[data-testid=save-settings]');
    expect((await state(page)).settings).toMatchObject({ name: 'Kart Cup Night', heatSize: 8, entryMode: 'per-race', formatAuto: true, lateSignups: true });
  });

  test('[REQ-UI-003] quick add skips duplicates and blanks and can check everyone in', async () => {
    await page.goto(url('players'));
    await page.click('[data-testid=quick-add]');
    await page.fill('[data-testid=quick-add-text]', NAMES.join('\n') + '\n\n  \nalex\nAlex\n');
    await page.click('label.toggle:has([data-testid=quick-add-checkin])');
    await page.click('[data-testid=quick-add-save]');
    const t = await state(page);
    expect(t.players).toHaveLength(29);
    expect(t.players.every((p: { status: string }) => p.status === 'checked-in')).toBe(true);
  });

  test('[REQ-UI-027] kiosk sign-up with name, tag and badge colour, no character choice, checked in automatically', async () => {
    await page.goto(url('join'));
    await expect(page.locator('.avatar-choice')).toHaveCount(0);
    await expect(page.locator('.kiosk')).not.toContainText(/favourite|Who do you drive/i);
    await kioskRegister(page, url, 'Kiosk Kai');
    const kai = (await state(page)).players.find((p: { name: string }) => p.name === 'Kiosk Kai');
    expect(kai).toMatchObject({ status: 'checked-in', tag: 'KI', color: '#2A6FD6' });
    expect(kai).not.toHaveProperty('avatar');
    expect(kai).not.toHaveProperty('favorite');
    await page.goto(url('join'));
    await page.fill('[data-testid=player-name]', 'kiosk kai');
    await page.click('[data-testid=kiosk-submit]');
    await expect(page.locator('.field-error, .notice-error, [role=alert]').first()).toBeVisible();
    expect((await state(page)).players).toHaveLength(30);
  });

  test('[REQ-UI-031][REQ-FMT-015] Start racing: heat size, format and round 1 race mode chosen with the real players and the plan', async () => {
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await expect(page.locator('[data-testid=start-count]')).toContainText('30 players');
    // 30 players at 8: knockout is suggested; this night is a classic one.
    await expect(page.locator('[data-testid=format-knockout]')).toHaveClass(/choice-on/);
    await page.click('[data-testid=heat-size-8]');
    await page.click('[data-testid=format-classic]');
    await expect(page.locator('.modal [data-testid=plan-total]')).toBeVisible();
    await expect(page.locator('[data-testid=start-race-kind-gp]')).toHaveClass(/choice-on/);
    await page.click('[data-testid=start-race-cc-200]');
    await shot(page, OUT, 'start-racing');
    await page.click('[data-testid=start-continue]');
    await expect(page.locator('[data-testid=race-setup] [data-testid=race-chip]')).toContainText('Grand Prix · 200cc');
    await page.keyboard.press('Escape');
    expect((await state(page)).settings).toMatchObject({ format: 'classic', formatAuto: false, race: { kind: 'gp', races: 4, cc: '200' } });
  });

  test('[REQ-UI-005][REQ-UI-006] Home shows the phase and the next heat; round preview with regenerate before saving', async () => {
    await page.goto(url());
    await expect(page.locator('.phasebar')).toBeVisible();
    await openRoundPreview(page);
    await expect(page.locator('[data-testid=save-round]')).toBeVisible();
    expect((await state(page)).rounds).toHaveLength(0);
    const firstPreview = await page.locator('.preview-grid').first().textContent();
    await page.click('[data-testid=regenerate]');
    await expect(page.locator('.preview-grid').first()).not.toHaveText(firstPreview ?? '');
    await page.click('[data-testid=save-round]');
    const t = await state(page);
    expect(t.rounds[0].heats.map((h: { playerIds: string[] }) => h.playerIds.length).sort()).toEqual([7, 7, 8, 8]);
    await expect(page.locator('[data-testid=now-title]')).toBeVisible();
    await expect(page.locator('[data-testid=home-enter]')).toBeVisible();
    await expect(page.locator('text=Up next').first()).toBeVisible();
    await page.goto(url('rounds'));
    await expect(page.locator('[data-testid=heat-card]')).toHaveCount(4);
    await page.goto(url());
    await expect(page.locator('[data-testid=generate-round]')).toHaveCount(0);
    await shot(page, OUT, 'home-now-racing');
  });

  test('[REQ-UI-013] the cup roulette shows the pick after Spin', async () => {
    await page.goto(url());
    expect((await state(page)).rounds[0].heats[0].cup).toBeUndefined();
    await page.click('[data-testid=spin-cup]');
    await expect(page.locator('.roulette').first()).toBeVisible();
    await expect.poll(async () => (await state(page)).rounds[0].heats[0].cup?.kind).toBe('cup');
  });

  test('[REQ-UI-007][REQ-A11Y-002] per-race entry by keyboard with running total and automatic next race', async () => {
    await page.goto(url());
    await page.click('[data-testid=home-enter]');
    await page.waitForSelector('.tap-tile');
    const n = await page.locator('.tap-tile').count();
    for (const k of [1, 2, 3, 4, 5, 6, 7].slice(0, n - 1)) await page.keyboard.press(String(k));
    // The last place filled itself and race 2 opened.
    await expect(page.locator('.race-tabs .tab-done')).toHaveCount(1);
    await expect(page.locator('[data-testid=race-tab-2]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.running tbody tr').first().locator('td.total')).toHaveText('15');
    await page.keyboard.press('1');
    await page.keyboard.press('Backspace');
    await enterPerRace(page, 4, perm, 1);
    await page.click('[data-testid=save-heat]');
    await expect(page.locator('.result-entry')).toHaveCount(0);
    expect((await state(page)).rounds[0].heats[0].result.mode).toBe('per-race');
  });

  test('[REQ-UI-008] console totals with tie-order arrows; the mode can be switched per heat', async () => {
    await page.goto(url());
    await page.click('[data-testid=home-enter]');
    await page.click('[data-testid=mode-totals]');
    await enterTotals(page, perm, true);
    await expect(page.locator('.tie-arrows').first()).toBeVisible();
    await page.click('[data-testid=save-heat]');
    await expect(page.locator('.result-entry')).toHaveCount(0);
    const heat = (await state(page)).rounds[0].heats[1];
    expect(heat.result.mode).toBe('totals');
    expect(new Set(Object.values(heat.result.points)).size).toBeLessThan(heat.playerIds.length);
    expect(await playQueue(page, url, perm)).toBe(2);
  });

  test('[REQ-UI-014] a late arrival added by the organizer starts next round; a kiosk sign-up gets the free-slot banner', async () => {
    await page.goto(url('players'));
    await page.click('[data-testid=add-player]');
    await page.fill('[data-testid=player-name]', 'Late Larry');
    await page.click('[data-testid=save-player]');
    let t = await state(page);
    expect(t.players.find((p: { name: string }) => p.name === 'Late Larry').joinedRound).toBe(1);
    await generateRound(page, url);
    t = await state(page);
    const larry = t.players.find((p: { name: string }) => p.name === 'Late Larry');
    expect(t.rounds[1].heats.some((h: { playerIds: string[] }) => h.playerIds.includes(larry.id))).toBe(true);
    // The organizer gets a dialog offering the free slot.
    await page.goto(url('players'));
    await page.click('[data-testid=add-player]');
    await page.fill('[data-testid=player-name]', 'Dialog Dora');
    await page.click('[data-testid=save-player]');
    await expect(page.locator('[data-testid=late-later]')).toBeVisible();
    await page.click('[data-testid=late-later]');
    // A kiosk sign-up gets the banner on Home instead.
    await kioskRegister(page, url, 'Lisa Lastminute');
    await page.goto(url());
    await expect(page.locator('.notice-late')).toBeVisible();
    await page.click('.notice-late .late-row:has-text("Lisa Lastminute") button >> nth=0');
    t = await state(page);
    const lisa = t.players.find((p: { name: string }) => p.name === 'Lisa Lastminute');
    expect(lisa.status).toBe('active');
    expect(t.rounds[1].heats.some((h: { playerIds: string[] }) => h.playerIds.includes(lisa.id))).toBe(true);
  });

  test('[REQ-UI-004] players screen: search, check-in toggle, edit, withdraw with confirmation, reinstate', async () => {
    await page.goto(url('players'));
    await page.fill('input[type=search]', 'dor');
    await expect(page.locator('[data-testid=player-row]')).toHaveCount(1);
    await page.click('label.toggle:has([data-testid="checkin-Dialog Dora"])');
    expect((await state(page)).players.find((p: { name: string }) => p.name === 'Dialog Dora').status).toBe('registered');
    await page.click('label.toggle:has([data-testid="checkin-Dialog Dora"])');
    if (await page.locator('[data-testid=late-later]').count()) await page.click('[data-testid=late-later]');
    await page.click('button[aria-label="Edit Dialog Dora"]');
    await page.fill('[data-testid=player-name]', 'Dialog Doris');
    await page.click('[data-testid=save-player]');
    expect((await state(page)).players.some((p: { name: string }) => p.name === 'Dialog Doris')).toBe(true);
    await page.fill('input[type=search]', '');
    await page.click('[data-testid="withdraw-Ole"]');
    await expect(page.locator('[data-testid=confirm-ok]')).toBeVisible();
    await page.click('[data-testid=confirm-ok]');
    let t = await state(page);
    const ole = t.players.find((p: { name: string }) => p.name === 'Ole');
    expect(ole.status).toBe('withdrawn');
    expect(t.rounds[1].heats.some((h: { playerIds: string[]; result?: unknown }) => !h.result && h.playerIds.includes(ole.id))).toBe(false);
    await page.fill('input[type=search]', 'Ole');
    await page.click('button:has-text("Reinstate")');
    t = await state(page);
    expect(t.players.find((p: { name: string }) => p.name === 'Ole').status).toBe('checked-in');
    await page.fill('input[type=search]', '');
    await page.click('[data-testid="withdraw-Ole"]');
    await page.click('[data-testid=confirm-ok]');
  });

  test('[REQ-UI-019] unplayed heat cards can be reordered and a racer moved', async () => {
    await page.goto(url('rounds'));
    const before = (await state(page)).rounds[1].heats.map((h: { id: string }) => h.id);
    await page.locator('[data-testid=heat-card]').nth(1).locator('button[aria-label="Play earlier"]').click();
    const after = (await state(page)).rounds[1].heats.map((h: { id: string }) => h.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    const card = page.locator('[data-testid=heat-card]').nth(0);
    const mover = card.locator('button[aria-label^="Move "]').first();
    await mover.click();
    const target = card.locator('.move-menu button:not([disabled])').first();
    if (await target.count()) {
      const sizesBefore = (await state(page)).rounds[1].heats.map((h: { playerIds: string[] }) => h.playerIds.length);
      await target.click();
      const sizesAfter = (await state(page)).rounds[1].heats.map((h: { playerIds: string[] }) => h.playerIds.length);
      expect(sizesAfter).not.toEqual(sizesBefore);
    } else {
      await mover.click();
    }
  });

  test('[REQ-DATA-002][REQ-DATA-003] a reload or tab close mid-heat keeps saved results and the half-entered draft', async () => {
    await page.goto(url());
    await page.click('[data-testid=home-enter]');
    await enterPerRace(page, 4, perm);
    await page.click('[data-testid=save-heat]');
    await page.click('[data-testid=home-enter]');
    await enterPerRace(page, 2, perm);
    const heatUrl = page.url();
    const before = await state(page);
    await page.reload();
    await page.waitForSelector('.result-entry');
    expect(await state(page)).toEqual(before);
    expect(page.url()).toBe(heatUrl);
    await expect(page.locator('.race-tabs .tab-done')).toHaveCount(2);
    // Close the tab without any unload handling, open a new one.
    await page.close({ runBeforeUnload: false });
    page = await ctx.newPage();
    errors = watchErrors(page);
    page.on('dialog', (d) => void d.accept());
    await page.goto(heatUrl);
    await page.waitForSelector('.result-entry');
    expect(await state(page)).toEqual(before);
    await expect(page.locator('.race-tabs .tab-done')).toHaveCount(2);
    await enterPerRace(page, 4, perm, 2);
    await page.click('[data-testid=save-heat]');
    await expect(page.locator('.result-entry')).toHaveCount(0);
  });

  test('[REQ-DATA-013] undo names the action and reverts it', async () => {
    await page.goto(url());
    const undo = page.locator('[data-testid=undo]');
    await expect(undo).toHaveAttribute('aria-label', /Undo: Saved heat result/);
    const before = await state(page);
    await undo.click();
    expect(await state(page)).not.toEqual(before);
    await page.click('[data-testid=home-enter]');
    await enterPerRace(page, 4, perm);
    await page.click('[data-testid=save-heat]');
    await playQueue(page, url, perm);
  });

  test('[REQ-UI-016][REQ-UI-017][REQ-DATA-021] big screen follows live, survives a reopen, never writes storage', async () => {
    await generateRound(page, url);
    const big = await ctx.newPage();
    await big.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      (window as unknown as { __writes: string[] }).__writes = [];
      Storage.prototype.setItem = function (k: string, v: string) {
        (window as unknown as { __writes: string[] }).__writes.push(k);
        return orig.call(this, k, v);
      };
    });
    await big.setViewportSize({ width: 1920, height: 1080 });
    await big.goto(url('big'));
    await expect(big.locator('[data-testid=big-screen]')).toBeVisible();
    await expect(big.locator('button, input, a[href]')).toHaveCount(0);
    await page.goto(url());
    await page.click('[data-testid=spin-cup]');
    await expect(big.locator('.big-spin')).toBeVisible({ timeout: 10_000 });
    await shot(big, OUT, 'big-screen-roulette');
    // Close mid-heat and reopen: it shows the live state again.
    await page.click('[data-testid=home-enter]');
    await enterPerRace(page, 2, perm);
    await big.close();
    const big2 = await ctx.newPage();
    await big2.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      (window as unknown as { __writes: string[] }).__writes = [];
      Storage.prototype.setItem = function (k: string, v: string) {
        (window as unknown as { __writes: string[] }).__writes.push(k);
        return orig.call(this, k, v);
      };
    });
    await big2.setViewportSize({ width: 1920, height: 1080 });
    await big2.goto(url('big'));
    await expect(big2.locator('[data-testid=big-screen]')).toBeVisible();
    await enterPerRace(page, 4, perm, 2);
    await page.click('[data-testid=save-heat]');
    const t = await state(page);
    const nowHeat = t.rounds[2].heats.find((h: { result?: unknown }) => !h.result);
    const first = t.players.find((p: { id: string }) => p.id === nowHeat.playerIds[0]).name;
    await expect(big2.locator('[data-testid=big-screen]')).toContainText(first, { timeout: 20_000 });
    expect(await big2.evaluate(() => (window as unknown as { __writes: string[] }).__writes)).toEqual([]);
    await playQueue(page, url, perm, { totalsEvery: 3 });
    await big2.close();
  });

  test('[REQ-UI-009] standings: arrows, cut line, finals status and the tie tooltip on focus', async () => {
    await page.goto(url('standings'));
    await expect(page.locator('.move-up, .move-down, .move-same').first()).toBeVisible();
    await expect(page.locator('.cut-row').first()).toBeVisible();
    const tie = page.locator('.tie-btn').first();
    if (await tie.count()) {
      await tie.focus();
      await expect(page.locator('.tooltip.open').first()).toBeVisible();
    }
    await shot(page, OUT, 'standings');
  });

  test('[REQ-UI-010] finals screen: stage table, seeds, sudden death, confirmed start, bracket', async () => {
    await page.goto(url('finals'));
    await expect(page.locator('.stage-table').first()).toBeVisible();
    await settleSuddenDeaths(page);
    await page.click('[data-testid=start-finals]');
    await expect(page.locator('[data-testid=confirm-ok]')).toBeVisible();
    await page.click('[data-testid=confirm-ok]');
    const t = await state(page);
    expect(t.finals.stages[0].heats).toHaveLength(2);
    const ole = t.players.find((p: { name: string }) => p.name === 'Ole');
    expect(t.finals.stages[0].seeds).not.toContain(ole.id);
    await expect(page.locator('.bracket').first()).toBeVisible();
    await playQueue(page, url, perm);
    expect((await state(page)).finals.stages[1].heats[0].result).toBeDefined();
  });

  test('[REQ-UI-012] podium ceremony with confetti and the final standings table', async () => {
    await page.goto(url('podium'));
    await expect(page.locator('.podium-slot').first()).toBeVisible();
    await expect(page.locator('.confetti').first()).toBeAttached();
    await expect(page.locator('table').first()).toBeVisible();
    await shot(page, OUT, 'podium');
  });

  test('[REQ-UI-018][REQ-DATA-019] settings: max per heat locked, exports, reset needs the typed name', async () => {
    await page.goto(url('settings'));
    await expect(page.locator('[data-testid=heat-size-4] input')).toBeDisabled();
    await expect(page.locator('[data-testid=format-knockout] input')).toBeDisabled();
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-json]')]);
    expect(json.suggestedFilename()).toMatch(/^kart-cup-night-\d{4}-\d{2}-\d{2}-backup\.json$/);
    await page.goto(url('standings'));
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-csv]')]);
    expect(csv.suggestedFilename()).toBe('kart-cup-night-standings.csv');
    await page.goto(url('settings'));
    await page.click('[data-testid=reset]');
    await page.fill('[data-testid=confirm-type]', 'Kart Cup');
    await expect(page.locator('[data-testid=confirm-ok]')).toBeDisabled();
    await page.fill('[data-testid=confirm-type]', 'Kart Cup Night');
    await expect(page.locator('[data-testid=confirm-ok]')).toBeEnabled();
    await page.keyboard.press('Escape');
    expect(await state(page)).not.toBeNull();
    // Withdraw and delete-result confirmations were covered above; demo asks too.
    await page.click('[data-testid=settings-demo]');
    await expect(page.locator('[data-testid=confirm-ok]')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('[REQ-I18N-003][REQ-I18N-004] switching language re-renders everything, the big screen too, without touching data', async () => {
    const before = await state(page);
    const big = await ctx.newPage();
    await big.goto(url('big'));
    await page.goto(url('standings'));
    await page.click('[data-testid=lang]');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('.topnav')).toContainText('Tabelle');
    await expect(big.locator('html')).toHaveAttribute('lang', 'de');
    await expect(big.locator('[data-testid=big-screen]')).toContainText('Podium');
    expect(await state(page)).toEqual(before);
    await shot(page, OUT, 'standings-german');
    await page.click('[data-testid=lang]');
    await big.close();
  });
});
