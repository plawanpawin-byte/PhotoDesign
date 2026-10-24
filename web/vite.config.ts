/// <reference types="vitest" />
import { defineConfig } from 'vite';

// Relative asset URLs, so the build also works from file:// and inside the Electron host.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
});
