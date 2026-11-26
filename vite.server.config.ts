// Builds the server (src/server/main.ts) into dist/server.mjs: one file, Node 18+, no dependencies.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node18',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
