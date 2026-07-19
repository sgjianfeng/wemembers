import { defineConfig } from "@playwright/test";

/**
 * Production / remote E2E — no local webServer.
 * Example:
 *   PLAYWRIGHT_BASE_URL=https://wemembers.store npx playwright test \
 *     tests/e2e/meow-bbq-register-prod.spec.ts --config=playwright.prod.config.ts
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://wemembers.store",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // no webServer — hits remote
});
