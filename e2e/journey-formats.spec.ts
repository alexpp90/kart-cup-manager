// The v2 formats through the real UI: the planner, a knockout night with lucky
// losers, a Last Chance heat, a league, and the measured time on Home and the TV.
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { expect, httpUrl as url, NAMES, permuter, playQueue, quickAdd, setupTournament, shot, state, watchErrors } from './helpers';

const test = base;
test.describe.configure({ mode: 'serial' });

let ctx: BrowserContext;
let page: Page;
let errors: string[];
const perm = permuter(5);
const OUT = 'formats';

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  page = await ctx.newPage();
  errors = watchErrors(page);
});
test.afterEach(() => expect(errors, 'browser errors').toEqual([]));
test.afterAll(async () => ctx.close());

/** Start the next tournament from an empty app. */
async function fresh() {
  await page.goto(url());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

const sizes = (r: { heats: { playerIds: string[] }[] }) => r.heats.map((h) => h.playerIds.length);

test.describe('[journey] formats', () => {
  test('[REQ-PLAN-002][REQ-PLAN-003][REQ-FMT-002] the planner shows the plan, warns over 3 hours and offers shorter variants', async () => {
    await page.goto(url());
    await page.click('[data-testid=new-tournament]');
    await page.click('[data-testid=wizard-next]');
    await page.locator('[data-testid=expected-players]').fill('6');
    // Everyone fits into one heat of 8: league is suggested and chosen.
    await expect(page.locator('[data-testid=format-league]')).toContainText('suggested');
    await expect(page.locator('[data-testid=format-league]')).toHaveClass(/choice-on/);
    await page.locator('[data-testid=expected-players]').fill('30');
    await expect(page.locator('[data-testid=format-knockout]')).toHaveClass(/choice-on/);
    await page.click('[data-testid=heat-size-4]');
    await page.fill('[data-testid=start-time]', '19:00');
    await expect(page.locator('[data-testid=plan-total]')).toHaveText('4 h 15 min');
    await expect(page.locator('[data-testid=plan-diagram] .plan-col')).toHaveCount(4);
    await expect(page.locator('[data-testid=plan-breakdown]')).toContainText('ends ≈ 23:15');
    await expect(page.locator('[data-testid=plan-warning]')).toContainText('more than 3 hours');
    await shot(page, OUT, 'planner-warning');
    await page.click('[data-testid=use-alt-0]');
    await expect(page.locator('[data-testid=plan-total]')).toHaveText('3 h 7 min');
    // German labels.
    await page.click('button:has-text("DE")');
    await expect(page.locator('[data-testid=plan-breakdown]')).toContainText('Ende ≈');
    await shot(page, OUT, 'planner-de');
    await page.click('button:has-text("EN")');
  });

  test('[REQ-FMT-004][REQ-FMT-005][REQ-FMT-008][REQ-FMT-014][REQ-UI-029] a knockout night: draw, top 4 go on, lucky losers fill the semis, final, podium', async () => {
    await fresh();
    await setupTournament(page, url, { name: 'KO Night', format: 'knockout', max: 8, players: 20, entry: 'totals' });
    await quickAdd(page, url, NAMES.slice(0, 20));
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await expect(page.locator('[data-testid=regenerate]')).toBeVisible();
    await page.click('[data-testid=regenerate]');
    // Every player in the preview has a controller number 1..n per heat.
    await expect(page.locator('.preview-heat').first().locator('[data-testid=seat]')).toHaveText(['1', '2', '3', '4', '5', '6', '7']);
    await page.click('[data-testid=save-round]');
    let t = await state(page);
    expect(sizes(t.rounds[0])).toEqual([7, 7, 6]);
    await expect(page.locator('.now-player [data-testid=seat]')).toHaveText(['1', '2', '3', '4', '5', '6', '7']);
    await expect(page.locator('.now-player .avatar[data-initials]')).toHaveCount(7);
    expect(t.rounds[0]).toMatchObject({ advance: 4, fill: 'best' });
    await expect(page.locator('[data-testid=time-line]')).toContainText('per heat');
    expect(await playQueue(page, url, perm)).toBe(3);
    // Round 2 is seeded: no redraw, the lucky losers carry a clover.
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await expect(page.locator('[data-testid=regenerate]')).toHaveCount(0);
    await expect(page.locator('.preview-grid .lucky-mark')).toHaveCount(3);
    await page.click('[data-testid=save-round]');
    t = await state(page);
    expect(sizes(t.rounds[1])).toEqual([8, 7]);
    await page.goto(url('rounds'));
    await expect(page.locator('[data-testid=heat-card] .lucky-mark')).toHaveCount(3);
    await shot(page, OUT, 'knockout-round-2');
    expect(await playQueue(page, url, perm)).toBe(2);
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await expect(page.locator('.modal')).toContainText('The final');
    await page.click('[data-testid=save-round]');
    expect(await playQueue(page, url, perm)).toBe(1);
    t = await state(page);
    expect(t.rounds[2].final).toBe(true);
    await page.goto(url('standings'));
    await expect(page.locator('.standings-table').first()).toContainText(t.players.find((p: { id: string }) => p.id === t.rounds[2].heats[0].result.order[0]).name);
    await page.click('[role=tab]:has-text("Knockout")');
    await expect(page.locator('[data-testid=ko-table]')).toBeVisible();
    await expect(page.locator('[data-testid=ko-table] tbody tr').first()).toContainText('Champion');
    await shot(page, OUT, 'knockout-standings');
    await page.goto(url('finals'));
    await expect(page.locator('.bracket-col')).toHaveCount(4);
    await shot(page, OUT, 'knockout-bracket');
    await page.goto(url('podium'));
    await expect(page.locator('.podium-slot').first()).toBeVisible();
    await page.goto(url('join'));
    await expect(page.locator('.kiosk')).toContainText('Registration is closed');
  });

  test('[REQ-UI-028] badges show unique initials, the champion wears the crown, lucky losers the clover', async () => {
    await page.goto(url('standings'));
    await page.click('[role=tab]:has-text("Knockout")');
    const initials = await page.locator('[data-testid=ko-table] .avatar').evaluateAll((els) => els.map((e) => e.getAttribute('data-initials')));
    expect(initials).toHaveLength(20);
    expect(new Set(initials).size).toBe(20);
    await expect(page.locator('[data-testid=ko-table] tbody tr').first().locator('.mark-crown')).toHaveCount(1);
    await expect(page.locator('[data-testid=ko-table] .mark-clover')).toHaveCount(3);
    await shot(page, OUT, 'badges-marks');
  });

  test('[REQ-TIME-002][REQ-PLAN-004] Home and the big screen show the time per heat, heats left and the end time; Home compares with the setup plan', async () => {
    await fresh();
    await setupTournament(page, url, { name: 'Clock Cup', format: 'knockout', max: 4, players: 12, entry: 'totals' });
    await quickAdd(page, url, NAMES.slice(0, 6));
    await page.goto(url());
    await expect(page.locator('[data-testid=plan-diff]')).toContainText('planned for 12, now 6 players: −51 min');
    await quickAdd(page, url, NAMES.slice(6, 12));
    await page.goto(url());
    await expect(page.locator('[data-testid=plan-diff]')).toHaveCount(0);
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await page.click('[data-testid=save-round]');
    const line = page.locator('[data-testid=time-line]');
    await expect(line).toContainText('(estimate)');
    await expect(line).toContainText('6 heats left');
    await expect(line).toContainText('ends ≈');
    expect(await playQueue(page, url, perm)).toBe(3);
    await page.goto(url());
    await expect(line).toContainText('measured over 3 heats');
    await expect(line).toContainText('3 heats left');
    const big = await ctx.newPage();
    await big.setViewportSize({ width: 1920, height: 1080 });
    await big.goto(url('big'));
    await expect(big.locator('.big-time')).toContainText('heats left', { timeout: 10_000 });
    await shot(big, OUT, 'big-screen-knockout');
    await big.close();
  });

  test('[REQ-FMT-007] knockout with Last Chance: the extra heat is queued after the round and decides the free place', async () => {
    await fresh();
    await setupTournament(page, url, { name: 'LC Cup', format: 'knockout', max: 4, players: 10, entry: 'totals', fill: 'last-chance' });
    await quickAdd(page, url, NAMES.slice(0, 10));
    await page.goto(url());
    await page.click('[data-testid=generate-round]');
    await page.click('[data-testid=save-round]');
    expect(sizes((await state(page)).rounds[0])).toEqual([4, 3, 3]);
    expect(await playQueue(page, url, perm)).toBe(4);
    const t = await state(page);
    expect(t.rounds[0].lastChance.playerIds).toHaveLength(4);
    expect(t.rounds[0].lastChance.result).toBeTruthy();
    await page.goto(url('rounds'));
    await expect(page.locator('[data-testid=heat-card]').filter({ hasText: 'Last Chance' })).toHaveCount(1);
    await expect(page.locator('[data-testid=round-outcome]')).toContainText('7 go on');
  });

  test('[REQ-FMT-003][REQ-FMT-011] a league with final-order entry: everyone races every cup, total points decide', async () => {
    await fresh();
    await setupTournament(page, url, { name: 'League Night', format: 'league', max: 8, players: 5, entry: 'ranking' });
    await quickAdd(page, url, NAMES.slice(0, 5));
    for (let cup = 1; cup <= 3; cup++) {
      await page.goto(url());
      await page.click('[data-testid=generate-round]');
      await expect(page.locator('.modal')).toContainText(`Cup ${cup}`);
      await page.click('[data-testid=save-round]');
      expect(await playQueue(page, url, perm)).toBe(1);
    }
    const t = await state(page);
    expect(t.rounds.map((r: { heats: { playerIds: string[] }[] }) => sizes(r))).toEqual([[5], [5], [5]]);
    expect(t.rounds.every((r: { heats: { result: { mode: string } }[] }) => r.heats[0].result.mode === 'ranking')).toBe(true);
    await page.goto(url('standings'));
    await page.click('[role=tab]:has-text("League")');
    await expect(page.locator('[data-testid=league-table] tbody tr')).toHaveCount(5);
    await shot(page, OUT, 'league-standings');
    await page.goto(url('podium'));
    await expect(page.locator('.podium-slot').first()).toBeVisible();
  });
});
