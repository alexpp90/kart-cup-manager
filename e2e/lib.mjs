// Shared helpers for the end-to-end runs (playwright-core + system Chromium).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const appUrl = 'file://' + path.join(root, 'dist', 'index.html');

const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].filter(Boolean);

export async function launch() {
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
}

export function outDir(name) {
  const dir = path.join(root, 'e2e', 'out', name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function shooter(page, dir) {
  let n = 0;
  return async (name, opts = {}) => {
    n++;
    await page.waitForTimeout(opts.wait ?? 700);
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: opts.full ?? false });
    return file;
  };
}
