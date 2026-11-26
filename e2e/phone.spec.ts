// Phone sign-up through the Kart Cup server: organizer, phones, the station on
// the server's own screen and the TV, all against the real dist/server.mjs.
import { test as base, devices, type BrowserContext, type Page } from '@playwright/test';
import { expect, shot, state, watchErrors } from './helpers';

const SERVER = 'http://localhost:4180';
const test = base;
test.describe.configure({ mode: 'serial' });

let org: BrowserContext;
let page: Page;
let phone: BrowserContext;
let errors: string[];
let code = '';

test.beforeAll(async ({ browser }) => {
  org = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  page = await org.newPage();
  errors = watchErrors(page);
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  phone = await browser.newContext({ ...pixel });
});
test.afterEach(() => expect(errors, 'browser errors').toEqual([]));
test.afterAll(async () => {
  await phone.close();
  await org.close();
});

test.describe('[journey] phone sign-up', () => {
  test('[REQ-HOST-005] the offline file and the plain preview make no request and explain what is needed', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const requests: string[] = [];
    p.on('request', (r) => requests.push(r.url()));
    await p.goto('/');
    await p.click('[data-testid=new-tournament]');
    for (let i = 0; i < 3; i++) await p.click('[data-testid=wizard-next]');
    await p.click('[data-testid=create-tournament]');
    await expect(p.locator('[data-testid=phone-offline-hint]')).toContainText('Kart Cup server');
    expect(requests.filter((u) => u.includes('/api/'))).toEqual([]);
    await ctx.close();
  });

  test('[REQ-HOST-001][REQ-HOST-002][REQ-HOST-004] the organizer starts phone sign-up and gets a QR code and a join code', async () => {
    await page.goto(SERVER + '/');
    await page.click('[data-testid=new-tournament]');
    await page.fill('[data-testid=setup-name]', 'Phone Night');
    for (let i = 0; i < 3; i++) await page.click('[data-testid=wizard-next]');
    await page.click('[data-testid=create-tournament]');
    await page.click('[data-testid=phone-start]');
    await expect(page.locator('[data-testid=phone-status]')).toContainText('Live');
    code = (await page.locator('[data-testid=phone-code]').textContent()) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await expect(page.locator('.phone-card [data-testid=qr]')).toBeVisible();
    await expect(page.locator('[data-testid=phone-url]')).toContainText(`/#/s/${code}`);
    await shot(page, 'phone', 'organizer-card');
  });

  test('[REQ-HOST-002] a guest signs up on a phone and appears in the organizer’s list within seconds', async () => {
    const p = await phone.newPage();
    const perr = watchErrors(p);
    await p.goto(`${SERVER}/#/s/${code}`);
    await expect(p.locator('.guest-title')).toHaveText('Phone Night');
    await p.fill('[data-testid=player-name]', 'Lena Phone');
    await p.fill('[data-testid=player-tag]', 'LP');
    await p.click('.color-choice >> nth=3');
    await shot(p, 'phone', 'phone-form');
    await p.click('[data-testid=guest-submit]');
    await expect(p.locator('[data-testid=guest-welcome]')).toContainText('Lena Phone');
    await shot(p, 'phone', 'phone-welcome');
    await expect(page.locator('[data-testid=player-row]')).toHaveCount(1, { timeout: 8000 });
    await expect(page.locator('.toasts')).toContainText('signed up by phone');
    const t = await state(page);
    expect(t.players[0]).toMatchObject({ name: 'Lena Phone', tag: 'LP', color: '#3CB44B', status: 'checked-in' });
    // The same name again is refused on the phone.
    await p.click('[data-testid=guest-another]');
    await p.fill('[data-testid=player-name]', 'lena phone');
    await p.click('[data-testid=guest-submit]');
    await expect(p.locator('.field-error')).toContainText('already taken');
    // Chromium logs the expected 409 (name taken) as a console error; nothing else may appear.
    expect(perr.filter((e) => !/status of 409/.test(e))).toEqual([]);
    await p.close();
  });

  test('[REQ-HOST-003] the station on the server’s own screen signs people up with keyboard and mouse and shows the QR code', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desk = await ctx.newPage();
    await desk.goto(`${SERVER}/#/desk`);
    await expect(desk.locator('.desk-side [data-testid=qr]')).toBeVisible();
    await expect(desk.locator('[data-testid=player-name]')).toBeFocused();
    await desk.waitForTimeout(700);
    await shot(desk, 'phone', 'station');
    await desk.keyboard.type('Desk Dan');
    await desk.keyboard.press('Enter');
    await expect(desk.locator('[data-testid=guest-welcome]')).toContainText('Desk Dan');
    await desk.waitForTimeout(700);
    await shot(desk, 'phone', 'station-welcome');
    await expect(page.locator('[data-testid=player-row]')).toHaveCount(2, { timeout: 8000 });
    await expect(page.locator('.toasts')).toContainText('at the station');
    await ctx.close();
  });

  test('[REQ-HOST-002] the TV shows the QR code; once registration closes, phones are told so', async () => {
    const tv = await org.newPage();
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.goto(`${SERVER}/#/big`);
    await expect(tv.locator('[data-testid=big-join-qr]')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(1000);
    await shot(tv, 'phone', 'tv-registration');
    await tv.close();
    // Three players race the final at once: no seats left, registration closes.
    await page.goto(SERVER + '/#/players');
    await page.click('[data-testid=add-player]');
    await page.fill('[data-testid=player-name]', 'Third');
    await page.click('[data-testid=save-player]');
    await page.goto(SERVER + '/');
    await page.click('[data-testid=generate-round]');
    await page.click('[data-testid=save-round]');
    await page.goto(SERVER + '/#/players');
    await expect(page.locator('.phone-card .notice-warn')).toBeVisible({ timeout: 8000 });
    const p = await phone.newPage();
    await p.goto(`${SERVER}/#/s/${code}`);
    await expect
      .poll(async () => {
        await p.reload();
        await p.waitForSelector('.guest-form, [data-testid=guest-closed]');
        return p.locator('[data-testid=guest-closed]').count();
      }, { timeout: 15_000 })
      .toBe(1);
    await p.close();
  });

  test('[REQ-HOST-002] stopping phone sign-up ends the link', async () => {
    await page.goto(SERVER + '/#/players');
    await page.click('[data-testid=phone-stop]');
    await page.click('[data-testid=confirm-ok]');
    await expect(page.locator('[data-testid=phone-start]')).toBeVisible();
    const p = await phone.newPage();
    await p.goto(`${SERVER}/#/s/${code}`);
    await expect(p.locator('[data-testid=guest-error]')).toContainText('not valid');
    await p.close();
  });
});
