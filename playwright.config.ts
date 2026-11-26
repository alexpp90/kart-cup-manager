// E2E tests against the built single-file app (`npm run build` first; `npm run e2e` does both).
// Uses the system Chromium so no browser download is needed.
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
export const PORT = 4179;
export const SERVER_PORT = 4180;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts$/,
  outputDir: 'test-results',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 3,
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox', '--allow-file-access-from-files'] },
  },
  webServer: [
    {
      command: `npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // The Kart Cup server (phone sign-up), with throwaway data.
      command: `rm -rf test-results/server-data && PORT=${SERVER_PORT} DATA_DIR=test-results/server-data node dist/server.mjs`,
      url: `http://localhost:${SERVER_PORT}/api/info`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
