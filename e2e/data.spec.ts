// Data robustness through the real UI: storage failures, corrupted data, schema
// versions, import/export, undo, leave warning, two windows and origins.
import type { Page } from '@playwright/test';
import { diskUrl, expect, httpUrl as url, quickAdd, setupTournament, state, STORAGE_KEY, test } from './helpers';

async function newTournament(page: Page, name = 'Data Cup') {
  await setupTournament(page, url, { name });
  await quickAdd(page, url, ['Ann', 'Ben', 'Cat', 'Dan']);
}

async function importFile(page: Page, content: string, trigger = '[data-testid=import-json]') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(trigger)]);
  await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) });
}

async function exportJson(page: Page): Promise<string> {
  await page.goto(url('settings'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-json]')]);
  const chunks: Buffer[] = [];
  for await (const c of await dl.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test('[REQ-DATA-001] every change is saved at once and a reload shows it', async ({ page, errors: _ }) => {
  await newTournament(page);
  await page.reload();
  await expect(page.locator('[data-testid=player-row]')).toHaveCount(4);
  expect((await state(page)).players).toHaveLength(4);
});

test('[REQ-DATA-004] two windows: each adopts the other window’s changes live and nothing is lost', async ({ page, context, errors: _ }) => {
  await newTournament(page);
  const other = await context.newPage();
  await other.goto(url('players'));
  await expect(other.locator('[data-testid=player-row]')).toHaveCount(4);
  await page.click('[data-testid=add-player]');
  await page.fill('[data-testid=player-name]', 'From A');
  await page.click('[data-testid=save-player]');
  await expect(other.locator('[data-testid=player-row]')).toHaveCount(5);
  await expect(other.locator('.toasts')).toContainText('another window');
  await other.click('[data-testid=add-player]');
  await other.fill('[data-testid=player-name]', 'From B');
  await other.click('[data-testid=save-player]');
  await expect(page.locator('[data-testid=player-row]')).toHaveCount(6);
  const names = (await state(page)).players.map((p: { name: string }) => p.name);
  expect(names).toEqual(expect.arrayContaining(['From A', 'From B']));
});

test('[REQ-DATA-005] storage full: no crash, a persistent warning offers a backup, the stored data is kept', async ({ page, errors: _ }) => {
  await page.addInitScript((key) => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key && (window as unknown as { __full?: boolean }).__full) throw new DOMException('full', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  }, STORAGE_KEY);
  await newTournament(page);
  const before = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true));
  await page.click('[data-testid=add-player]');
  await page.fill('[data-testid=player-name]', 'Does Not Fit');
  await page.click('[data-testid=save-player]');
  await expect(page.locator('[data-testid=storage-full]')).toBeVisible();
  await expect(page.locator('[data-testid=player-row]')).toHaveCount(5);
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe(before);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=storage-full] button')]);
  expect(dl.suggestedFilename()).toMatch(/backup\.json$/);
});

test('[REQ-DATA-006] storage blocked: the app works in memory, says so and can export', async ({ page, errors: _ }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await page.goto(url());
  await expect(page.locator('[data-testid=storage-unavailable]')).toBeVisible();
  await page.click('[data-testid=new-tournament]');
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=create-tournament]');
  await expect(page.locator('.players')).toBeVisible();
  await expect(page.locator('[data-testid=storage-unavailable]')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=storage-unavailable] button')]);
  expect(dl.suggestedFilename()).toMatch(/backup\.json$/);
});

test('[REQ-DATA-007] corrupted storage: recovery screen, nothing wiped, a copy kept, download and start fresh', async ({ page, errors: _ }) => {
  await page.goto(url());
  await page.evaluate((k) => localStorage.setItem(k, '{"t": {"players": [ oops'), STORAGE_KEY);
  await page.reload();
  await expect(page.locator('[data-testid=recovery]')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('{"t": {"players": [ oops');
  expect(await page.evaluate(() => localStorage.getItem('kart-cup-manager:v1:corrupt'))).toBe('{"t": {"players": [ oops');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=recovery-download]')]);
  expect(dl.suggestedFilename()).toMatch(/damaged/);
  await page.click('[data-testid=recovery-fresh]');
  await page.click('[data-testid=confirm-ok]');
  await expect(page.locator('[data-testid=new-tournament]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kart-cup-manager:v1:corrupt'))).toBe('{"t": {"players": [ oops');
});

test('[REQ-DATA-007] recovery by importing a backup', async ({ page, errors: _ }) => {
  await newTournament(page);
  const backup = await exportJson(page);
  await page.evaluate((k) => localStorage.setItem(k, 'garbage'), STORAGE_KEY);
  await page.reload();
  await importFile(page, backup, '[data-testid=recovery-import]');
  await expect(page.locator('[data-testid=recovery]')).toHaveCount(0);
  expect((await state(page)).players).toHaveLength(4);
});

test('[REQ-DATA-008] missing fields are repaired with defaults and reported; broken structure goes to recovery', async ({ page, errors: _ }) => {
  await newTournament(page);
  await page.evaluate((k) => {
    const env = JSON.parse(localStorage.getItem(k)!);
    delete env.t.suddenDeath;
    delete env.t.settings.points4;
    delete env.t.players[0].tag;
    localStorage.setItem(k, JSON.stringify(env));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('.toasts')).toContainText('missing fields were filled');
  await expect(page.locator('[data-testid=player-row]')).toHaveCount(4);
  await page.evaluate((k) => {
    const env = JSON.parse(localStorage.getItem(k)!);
    env.t.rounds = 'broken';
    localStorage.setItem(k, JSON.stringify(env));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('[data-testid=recovery]')).toBeVisible();
});

test('[REQ-DATA-009] a backup or stored data from a newer app is rejected with a clear message', async ({ page, errors: _ }) => {
  await newTournament(page);
  const backup = JSON.parse(await exportJson(page));
  backup.tournament.version = 99;
  const before = await state(page);
  await importFile(page, JSON.stringify(backup));
  await expect(page.locator('.toasts')).toContainText('newer version');
  expect(await state(page)).toEqual(before);
  await page.evaluate((k) => {
    const env = JSON.parse(localStorage.getItem(k)!);
    env.t.version = 99;
    localStorage.setItem(k, JSON.stringify(env));
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('[data-testid=recovery]')).toContainText('newer version');
});

test('[REQ-DATA-010][REQ-DATA-012][REQ-DATA-014] export → wipe → import is lossless; import asks first; undo reverts it in one step', async ({ page, errors: _ }) => {
  await newTournament(page, 'Lossless');
  const original = await state(page);
  const backup = await exportJson(page);
  // Import over an existing tournament asks first; cancelling keeps everything.
  await page.goto(url('players'));
  await page.click('[data-testid=add-player]');
  await page.fill('[data-testid=player-name]', 'Extra');
  await page.click('[data-testid=save-player]');
  await page.goto(url('settings'));
  const changed = await state(page);
  await importFile(page, backup);
  await expect(page.locator('[data-testid=confirm-ok]')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await state(page)).toEqual(changed);
  await importFile(page, backup);
  await page.click('[data-testid=confirm-ok]');
  expect(await state(page)).toEqual(original);
  await page.click('[data-testid=undo]');
  expect(await state(page)).toEqual(changed);
  // Wipe and import into an empty app.
  await page.evaluate(() => localStorage.clear());
  await page.goto(url());
  await page.reload();
  await importFile(page, backup, 'button:has-text("Import backup")');
  expect(await state(page)).toEqual(original);
});

test('[REQ-DATA-011] an invalid or foreign file is rejected without touching the data', async ({ page, errors: _ }) => {
  await newTournament(page);
  await page.goto(url('settings'));
  const before = await state(page);
  for (const bad of ['not json at all', JSON.stringify({ app: 'something-else', tournament: {} }), JSON.stringify({ hello: 1 })]) {
    await importFile(page, bad);
    await expect(page.locator('.toasts')).toContainText('not a valid');
    expect(await state(page)).toEqual(before);
  }
});

test('[REQ-DATA-015] leave warning only when there are changes newer than the last export', async ({ page, errors: _ }) => {
  await newTournament(page);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  await page.click('.players h1');
  await page.close({ runBeforeUnload: true }).catch(() => {});
  // The dismissed dialog keeps the page open.
  await expect.poll(() => dialogs).toContain('beforeunload');
  await exportJson(page);
  dialogs.length = 0;
  await page.click('h1');
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 300));
  expect(dialogs).toEqual([]);
});

test('[REQ-DATA-016] file:// and http:// keep separate data; Settings shows where data is stored', async ({ page, errors: _ }) => {
  await newTournament(page, 'Over HTTP');
  await page.goto(url('settings'));
  await expect(page.locator('[data-testid=storage-origin]')).toContainText('http://localhost');
  await page.goto(diskUrl());
  await expect(page.locator('[data-testid=new-tournament]')).toBeVisible();
  expect(await state(page)).toBeNull();
});
