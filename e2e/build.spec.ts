// The single-file build: self-contained, works from disk and over http, makes no network requests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diskUrl, enterTotals, expect, httpUrl, permuter, root, test } from './helpers';

const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');

test('[REQ-BLD-001] one self-contained index.html that works from file:// and over http', async ({ page, errors: _ }) => {
  expect(html).not.toMatch(/<script[^>]+src=/i);
  expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet[^>]+href=/i);
  expect(html).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
  for (const url of [diskUrl, httpUrl]) {
    await page.goto(url());
    await page.click('[data-testid=load-demo]');
    await expect(page.locator('[data-testid=generate-round]')).toBeVisible();
  }
});

test('[REQ-BLD-002][REQ-UI-024] no network request leaves the page while running a heat; the name has no trademark', async ({ page, errors: _ }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(diskUrl());
  await expect(page).toHaveTitle('Kart Cup Manager');
  await expect(page.locator('.logo').first()).not.toContainText(/mario|nintendo/i);
  await page.click('[data-testid=load-demo]');
  await page.click('[data-testid=generate-round]');
  await page.click('[data-testid=save-round]');
  await page.click('[data-testid=spin-cup]');
  await page.click('[data-testid=home-enter]');
  await enterTotals(page, permuter(3));
  await page.click('[data-testid=save-heat]');
  await page.goto(diskUrl('standings'));
  await page.goto(diskUrl('big'));
  const foreign = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(foreign).toEqual([]);
  expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).not.toMatch(/mario|nintendo/i);
  expect(html).not.toMatch(/<img[^>]+src=["']?https?:/i);
});
