import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false, // Run integration tests sequentially against local MongoDB
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/queueless_test?directConnection=true',
    },
  },
});

