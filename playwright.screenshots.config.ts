import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/screenshots",
  testMatch: "capture.ts",
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
