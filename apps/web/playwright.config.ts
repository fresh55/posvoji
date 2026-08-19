import { defineConfig, devices } from "@playwright/test";

// Its own port, so a dev server already running on 3000 keeps running.
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker against one dev server. Turbopack compiles a route on its first
  // request, and parallel workers only make that first request slower.
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm run dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold Windows start has to boot next dev and compile the home route.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
