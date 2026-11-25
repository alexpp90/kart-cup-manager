// Shared helpers for the Playwright specs. The app is the built dist/index.html,
// served over http (baseURL) or opened from disk (fileUrl).
import { expect, test as base, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const fileUrl = 'file://' + path.join(root, 'dist', 'index.html');
export const STORAGE_KEY = 'kart-cup-manager:v1';

export const NAMES = [
  'Alex', 'Bea', 'Chris', 'Dana', 'Eli', 'Fynn', 'Gina', 'Hugo', 'Ida', 'Jonas', 'Kim', 'Lena', 'Mo', 'Nele', 'Ole',
  'Pia', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uwe', 'Vera', 'Wim', 'Xenia', 'Yara', 'Zoe', 'Ben', 'Carla', 'David',
];

/** Fails the test on any page error or console error. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors = watchErrors(page);
    await use(errors);
    expect(errors, 'browser errors').toEqual([]);
  },
});
export { expect };

/** Deterministic permutations for finishing orders. */
export function permuter(seed = 7) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
}

export type Url = (hash?: string) => string;
export const httpUrl: Url = (hash = '') => `/${hash ? '#/' + hash : ''}`;
export const diskUrl: Url = (hash = '') => fileUrl + (hash ? '#/' + hash : '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const state = (page: Page): Promise<any> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').t ?? null, STORAGE_KEY);

export async function shot(page: Page, dir: string, name: string) {
  const out = path.join(root, 'e2e', 'out', dir);
  mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}

export async function setupTournament(page: Page, url: Url, o: { name: string; max?: 4 | 8; entry?: 'totals'; lastChance?: boolean }) {
  await page.goto(url());
  await page.click('[data-testid=new-tournament]');
  await page.fill('[data-testid=setup-name]', o.name);
  await page.click('[data-testid=wizard-next]');
  if (o.max === 4) await page.click('label.choice:has-text("4 per heat")');
  if (o.entry === 'totals') await page.click('label.choice:has-text("Console totals")');
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=wizard-next]');
  if (o.lastChance) {
    await page.click('label.toggle:has-text("Last Chance heat")');
    await page.click('label.choice:has-text("1")');
  }
  await page.click('[data-testid=wizard-next]');
  await page.click('[data-testid=create-tournament]');
  await expect(page.locator('.players')).toBeVisible();
}

export async function quickAdd(page: Page, url: Url, names: string[], checkIn = true) {
  await page.goto(url('players'));
  await page.click('[data-testid=quick-add]');
  await page.fill('[data-testid=quick-add-text]', names.join('\n'));
  if (checkIn) await page.click('label.toggle:has([data-testid=quick-add-checkin])');
  await page.click('[data-testid=quick-add-save]');
}

export async function kioskRegister(page: Page, url: Url, name: string) {
  await page.goto(url('join'));
  await page.fill('[data-testid=player-name]', name);
  await page.click('.avatar-choice >> nth=6');
  await page.click('.color-choice >> nth=5');
  await page.fill('input[placeholder="e.g. TT"]', name.slice(0, 2).toUpperCase());
  await page.fill('input[placeholder="Who do you drive?"]', 'The fast one');
  await page.click('[data-testid=kiosk-submit]');
  await expect(page.locator('.kiosk-welcome')).toBeVisible();
}

export async function generateRound(page: Page, url: Url) {
  await page.goto(url());
  await page.click('[data-testid=generate-round]');
  await page.click('[data-testid=regenerate]');
  await page.click('[data-testid=save-round]');
  await expect(page.locator('[data-testid=now-title]')).toBeVisible();
}

/** Tap finishing orders with the number keys; the last place fills itself. */
export async function enterPerRace(page: Page, races: number, perm: (n: number) => number[], from = 0) {
  await page.waitForSelector('.tap-tile');
  const n = await page.locator('.tap-tile').count();
  for (let r = from; r < races; r++) {
    await page.click(`[data-testid=race-tab-${r + 1}]`);
    for (const k of perm(n).slice(0, n - 1)) await page.keyboard.press(String(k));
  }
}

export async function enterTotals(page: Page, perm: (n: number) => number[], withTie = false) {
  const inputs = page.locator('input.totals-input');
  const n = await inputs.count();
  const values = perm(n).map((v) => v * 7 + 3);
  if (withTie && n > 2) values[1] = values[0];
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(values[i]));
}

/** Play every queued heat from Home. Returns how many were played. */
export async function playQueue(page: Page, url: Url, perm: (n: number) => number[], o: { races?: number; totalsEvery?: number } = {}) {
  let count = 0;
  for (;;) {
    await page.goto(url());
    const enter = page.locator('[data-testid=home-enter]');
    if (!(await enter.count())) break;
    await enter.click();
    await page.waitForSelector('.result-entry');
    const isTotals = (await page.locator('input.totals-input').count()) > 0;
    const useTotals = isTotals || (o.totalsEvery !== undefined && count % o.totalsEvery === o.totalsEvery - 1);
    if (useTotals && !isTotals) await page.click('[data-testid=switch-mode]');
    if (useTotals) await enterTotals(page, perm);
    else await enterPerRace(page, o.races ?? 4, perm);
    await page.click('[data-testid=save-heat]');
    await expect(page.locator('.notice-error')).toHaveCount(0);
    await expect(page.locator('.result-entry')).toHaveCount(0);
    if (++count > 40) throw new Error('runaway loop');
  }
  return count;
}

/** Decide any sudden death on the finals screen by tapping the tied players in order. */
export async function settleSuddenDeaths(page: Page) {
  for (let guard = 0; (await page.locator('[data-testid=save-sudden]').count()) && guard < 5; guard++) {
    const tiles = page.locator('.sudden .tap-tile');
    const n = await tiles.count();
    for (let i = 0; i < n - 1; i++) await tiles.nth(i).click();
    await page.click('[data-testid=save-sudden]');
  }
}
