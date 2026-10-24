import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['src/tests/globalSetup.js'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Test files share one database server; each file uses its own database.
    fileParallelism: false,
  },
});
