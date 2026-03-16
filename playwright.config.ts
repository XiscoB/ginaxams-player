/**
 * Playwright Configuration for GinaXams Player E2E Tests
 *
 * This configuration sets up Playwright to run end-to-end tests
 * against the Vite development server.
 *
 * Requirements:
 * - Fully client-side testing (no backend)
 * - GitHub Pages compatible (static hosting)
 * - Headless execution for CI
 * - Deterministic test execution
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Test directory
  testDir: "./tests/e2e",

  // Run files matching this pattern
  testMatch: "**/*.spec.ts",

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Run tests sequentially to avoid state conflicts
  workers: 1,

  // Reporter to use
  reporter: "list",

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: "http://localhost:3000",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video recording (disabled for determinism/performance)
    video: "off",

    // Run browser in headless mode (deterministic)
    headless: true,

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 10000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Run local dev server before starting the tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
