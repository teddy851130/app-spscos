import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3333',
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  webServer: {
    command: 'node_modules/.bin/next dev --port 3333',
    port: 3333,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
