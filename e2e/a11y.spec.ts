// Keyboard use, focus handling in modals and reduced motion.
import type { Page } from '@playwright/test';
import { expect, httpUrl as url, test } from './helpers';

/** Press Tab until the focused element matches, return false if it never does. */
async function tabTo(page: Page, selector: string, max = 60): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return true;
  }
  return false;
}

const focusRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
  });

test('[REQ-A11Y-001] the organizer flow works by keyboard alone with a visible focus ring', async ({ page, errors: _ }) => {
  await page.goto(url());
  expect(await tabTo(page, '[data-testid=new-tournament]')).toBe(true);
  expect(await focusRing(page)).toBe(true);
  await page.keyboard.press('Enter');
  expect(await tabTo(page, '[data-testid=setup-name]')).toBe(true);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Keyboard Cup');
  expect(await tabTo(page, '[data-testid=create-tournament]')).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=generate-round]')).toBeVisible();
  await page.goto(url('players'));
  expect(await tabTo(page, '[data-testid=quick-add]')).toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ann\nBen\nCat\nDan');
  expect(await tabTo(page, 'input[data-testid=quick-add-checkin]')).toBe(true);
  await page.keyboard.press('Space');
  expect(await tabTo(page, '[data-testid=quick-add-save]')).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=player-row]')).toHaveCount(4);
  await page.goto(url());
  expect(await tabTo(page, '[data-testid=generate-round]')).toBe(true);
  await page.keyboard.press('Enter');
  expect(await tabTo(page, '[data-testid=start-continue]', 150)).toBe(true);
  await page.keyboard.press('Enter');
  expect(await tabTo(page, '[data-testid=save-round]', 150)).toBe(true);
  await page.keyboard.press('Enter');
  expect(await tabTo(page, '[data-testid=home-enter]')).toBe(true);
  await page.keyboard.press('Enter');
  // Console totals (the default entry): the first field has focus, Tab moves on.
  await page.waitForSelector('input.totals-input');
  await expect(page.locator('input.totals-input').first()).toBeFocused();
  for (const v of ['60', '48', '40', '36']) {
    await page.keyboard.type(v);
    await page.keyboard.press('Tab');
  }
  expect(await tabTo(page, '[data-testid=save-heat]')).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('.result-entry')).toHaveCount(0);
});

test('[REQ-A11Y-003] modals take focus, trap Tab, close on Esc and give focus back', async ({ page, errors: _ }) => {
  await page.goto(url());
  await page.click('[data-testid=load-demo]');
  await page.goto(url('players'));
  await page.focus('[data-testid=add-player]');
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal')).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('.modal'))).toBe(true);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 3 ? 'Tab' : 'Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.modal'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('add-player');
});

test('[REQ-A11Y-004] reduced motion: animations collapse, no confetti, the roulette shows the pick at once', async ({ page, errors: _ }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url());
  await page.click('[data-testid=load-demo]');
  await page.click('[data-testid=generate-round]');
  await page.click('[data-testid=save-round]');
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')].map((e) => getComputedStyle(e).animationDuration).filter((d) => d !== '0s'),
  );
  for (const d of durations) expect(parseFloat(d)).toBeLessThan(0.001);
  await page.click('[data-testid=spin-cup]');
  await expect(page.locator('.reel-landed')).toBeVisible({ timeout: 500 });
  await expect(page.locator('.reel-spinning')).toHaveCount(0);
  // Podium confetti: the canvas is never sized or drawn.
  await page.evaluate(() => (location.hash = '#/podium'));
  const canvases = await page.locator('canvas.confetti').evaluateAll((cs) => cs.map((c) => (c as HTMLCanvasElement).width));
  for (const w of canvases) expect(w).toBe(300);
});
