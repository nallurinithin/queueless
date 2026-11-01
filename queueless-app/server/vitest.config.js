import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false, // Run integration tests sequentially against local MongoDB
    testTimeout: 15000,
  },
});

