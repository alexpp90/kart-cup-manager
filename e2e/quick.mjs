// Quick visual check: load demo data and screenshot the main screens.
import { appUrl, launch, outDir, shooter } from './lib.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = shooter(page, outDir('quick'));
await page.goto(appUrl);
await shot('welcome');
await page.click('[data-testid=load-demo]');
await shot('home');
for (const r of ['players', 'rounds', 'standings', 'finals', 'settings', 'join']) {
  await page.goto(appUrl + '#/' + r);
  await shot(r, { full: true });
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
