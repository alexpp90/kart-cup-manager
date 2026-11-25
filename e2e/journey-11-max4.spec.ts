// Quick second tournament: 11 players at max 4, console totals and a Last Chance heat.
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { expect, generateRound, httpUrl as url, kioskRegister, NAMES, permuter, playQueue, quickAdd, settleSuddenDeaths, setupTournament, state, watchErrors } from './helpers';

const test = base;
test.describe.configure({ mode: 'serial' });

let ctx: BrowserContext;
let page: Page;
let errors: string[];
const perm = permuter(11);

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  page = await ctx.newPage();
  errors = watchErrors(page);
});
test.afterEach(() => expect(errors, 'browser errors').toEqual([]));
test.afterAll(async () => ctx.close());

test.describe('[journey] 11 players, max 4, console totals', () => {
  test('[REQ-UI-008] three qualifying rounds of 4,4,3 entered as console totals', async () => {
    await setupTournament(page, url, { name: 'Small Cup', max: 4, entry: 'totals', lastChance: true });
    await quickAdd(page, url, NAMES.slice(0, 11));
    for (let r = 0; r < 3; r++) {
      await generateRound(page, url);
      expect((await state(page)).rounds[r].heats.map((h: { playerIds: string[] }) => h.playerIds.length).sort()).toEqual([3, 4, 4]);
      expect(await playQueue(page, url, perm)).toBe(3);
    }
    const t = await state(page);
    expect(t.rounds.flatMap((r: { heats: { result: { mode: string } }[] }) => r.heats.map((h) => h.result.mode))).toEqual(Array(9).fill('totals'));
  });

  test('[REQ-UI-015] a sign-up after qualifying is told they cannot reach the finals', async () => {
    await kioskRegister(page, url, 'Too Late Tom');
    await expect(page.locator('[data-testid=no-finals]')).toContainText('cannot reach the finals');
    await page.goto(url('players'));
    await page.click('[data-testid=add-player]');
    await page.fill('[data-testid=player-name]', 'Too Late Tina');
    await page.click('[data-testid=save-player]');
    await expect(page.locator('.toast, [role=status]').filter({ hasText: 'cannot reach the finals' }).first()).toBeVisible();
  });

  test('[REQ-UI-011] the Last Chance heat runs before the first finals stage and fills the wildcard spot', async () => {
    await page.goto(url('finals'));
    await settleSuddenDeaths(page);
    await page.click('[data-testid=start-finals]');
    await page.click('[data-testid=confirm-ok]');
    let t = await state(page);
    const lc = t.finals.stages[0].lastChance;
    expect(lc.playerIds).toHaveLength(4);
    const late = t.players.filter((p: { name: string }) => p.name.startsWith('Too Late')).map((p: { id: string }) => p.id);
    for (const id of late) expect(t.finals.stages[0].seeds.concat(lc.playerIds)).not.toContain(id);
    // The Last Chance heat is queued first.
    await page.goto(url());
    await expect(page.locator('[data-testid=now-title]')).toContainText(/Last Chance/i);
    await playQueue(page, url, perm);
    t = await state(page);
    expect(t.finals.stages[0].seeds).toHaveLength(8);
    const winner = t.finals.stages[0].seeds[7];
    expect(lc.playerIds).toContain(winner);
    await page.goto(url('podium'));
    await expect(page.locator('.podium-slot').first()).toBeVisible();
    await page.goto(url('join'));
    await expect(page.locator('.kiosk')).toContainText('Registration is closed');
  });
});
