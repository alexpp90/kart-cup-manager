import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single self-contained index.html: JS, CSS and fonts are inlined so the
// build works when opened straight from disk (file://) without internet.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2020', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  // Meshnet (NordVPN) peers reach the dev/preview server as <device>.nord.
  server: { allowedHosts: ['.nord'] },
  preview: { allowedHosts: ['.nord'] },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
