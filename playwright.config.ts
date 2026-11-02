// E2E (spec 8.10): Playwright against the built dist/ on a plain static host (tests/e2e/support/static-server.mjs:
// directory indexes and the 404.html fallback, no SPA rewrites), in Docker on the dev desktop. Browsers: Chromium,
// WebKit, Firefox (desktop) plus phone emulation for the @phone tests. The matrix-heavy specs (axe, layout) run
// on Chromium only and say so. Run: npm run build && npx playwright test   (E2E_BASE_URL=... to test another server)
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4183);
const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : process.env.CI ? 6 : undefined,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e/results.json' }]],
  use: {
    baseURL: BASE,
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone-chromium', grep: /@phone/, use: { ...devices['Pixel 7'] } },
    { name: 'phone-webkit', grep: /@phone/, use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node tests/e2e/support/static-server.mjs dist ${PORT}`,
        url: `${BASE}/en/`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
