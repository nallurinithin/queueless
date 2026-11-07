import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/start-test-server.js',
      cwd: path.resolve(__dirname, '../../queueless-app/server'),
      url: 'http://127.0.0.1:5005/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npx vite --port 5174',
      cwd: path.resolve(__dirname, '../../queueless-app/client'),
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_API_TARGET: 'http://localhost:5005',
      },
    },
  ],
});
