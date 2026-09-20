import { defineConfig, devices } from "@playwright/test";

/**
 * Two servers, two origins — the same shape as production. Both are reused when
 * already running (npm run dev), otherwise started for the test run.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  /**
   * One worker: the suite runs against a real API with a single seeded account, so
   * enrollment and progress are shared mutable state. Parallel files were racing —
   * one enrolling while another asserted the empty dashboard. Browser contexts are
   * isolated; the database is not.
   */
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev:web",
      url: "http://localhost:3100",
      reuseExistingServer: true,
      // A cold Turbopack start on this machine's filesystem regularly passes 120s.
      timeout: 240_000,
    },
    {
      command: "npm run courses",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: true,
    },
  ],
});
