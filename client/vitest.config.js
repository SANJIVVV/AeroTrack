import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // The browser loads shared code from /shared/... (served by Express); tests map it to the source folder.
  resolve: { alias: [{ find: /^\/shared\/(.*)$/, replacement: here('../shared/src/$1') }] },
  test: {
    root: here('.'),
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
