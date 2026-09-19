import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration targeting live production web app.
 * Can be overridden with E2E_BASE_URL (e.g. http://localhost:5173).
 */
export default defineConfig({
  testDir: './e2e',
  /* Maximum time one test can run for (allow generous headroom for live LLM response) */
  timeout: 90 * 1000,
  expect: {
    timeout: 20 * 1000,
  },
  /* Run tests in files sequentially to avoid account state collisions on live database */
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on failure in CI */
  retries: process.env.CI ? 1 : 0,
  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.E2E_BASE_URL || 'https://ai-data-analyst-app-swart.vercel.app',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /* Standard desktop viewport */
    viewport: { width: 1280, height: 720 },

    /* Action & navigation timeouts */
    actionTimeout: 20 * 1000,
    navigationTimeout: 45 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
