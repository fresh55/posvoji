import { defineConfig, devices } from "@playwright/test";

// Its own port, so a dev server already running on 3000 keeps running.
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

// The regression specs that need a real mobile context (isMobile, hasTouch,
// a touch-capable engine) rather than a desktop browser with a narrow
// viewport. Named here once so the desktop project can exclude them and the
// mobile projects can claim them without three copies of the same list
// going out of step.
const MOBILE_SPECS = [
  "shelter-picker-landscape.spec.ts",
  "filter-drawer-mobile.spec.ts",
  "deep-link-filters.spec.ts",
  "incremental-grid.spec.ts",
];

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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The mobile regression specs set up their own device context (see
      // MOBILE_SPECS below) and assert on mobile-only markup, such as the
      // dock that is display:none from lg up. Desktop Chrome never renders
      // it, so those files are this project's business only by exclusion.
      testIgnore: MOBILE_SPECS,
    },
    {
      name: "mobile-chromium",
      // Pixel 7: a current, representative Android viewport with isMobile
      // and hasTouch on, which a plain viewport resize never turns on. That
      // distinction is the whole point of this project -- see
      // mobile-filter-hardening.test.tsx and the audit that led here.
      use: { ...devices["Pixel 7"] },
      testMatch: MOBILE_SPECS,
    },
    {
      name: "mobile-webkit",
      // WebKit is a separate rendering and JS engine from Chromium, and iOS
      // Safari is the one mobile browser neither of the Chromium-based
      // projects above can stand in for.
      use: { ...devices["iPhone 14"] },
      testMatch: MOBILE_SPECS,
    },
  ],
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
