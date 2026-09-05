import { defineConfig, devices } from "@playwright/test";

// Its own port, so a dev server already running on 3000 keeps running.
const PORT = 3210;
export const PLAYWRIGHT_BASE_URL = `http://localhost:${PORT}`;

// The regression specs that need a real mobile context (isMobile, hasTouch,
// a touch-capable engine) rather than a desktop browser with a narrow
// viewport. Named here once so the desktop project can exclude them and the
// mobile projects can claim them without three copies of the same list
// going out of step.
const MOBILE_SPECS = [
  "shelter-picker-landscape.spec.ts",
  // The map's two-tap contract needs a device that cannot hover and a tap
  // that arrives as a tap; a desktop browser at a phone's width has neither.
  "shelter-picker-touch.spec.ts",
  "filter-drawer-mobile.spec.ts",
  "deep-link-filters.spec.ts",
  "incremental-grid.spec.ts",
  // The phone fan is the layout below sm, and its swipe arrives as a touch
  // pointer: the stage takes no pointer capture for one, on purpose, so it
  // does not fight the dialog's dismiss gesture over the same finger. A
  // desktop browser narrowed to 412px draws the same markup and never
  // exercises either.
  "photo-fan-mobile.spec.ts",
  // The dialog's own phone chrome: the animal arrows the title row carries
  // below sm, which a desktop browser never draws.
  "animal-dialog-mobile.spec.ts",
  // Pinch, pan and the pull-down that closes the lightbox all arrive as touch
  // pointers, two of them at once for the pinch.
  "photo-lightbox-mobile.spec.ts",
];

// Screenshot baselines have a deliberately smaller, dataset-free Chromium
// matrix in playwright.visual.config.ts. Keep them out of the broader browser
// suite so `test:e2e` retains its existing scope and setup requirements.
const VISUAL_SPECS = ["shelter-map.visual.spec.ts"];

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
    baseURL: PLAYWRIGHT_BASE_URL,
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
      testIgnore: [...MOBILE_SPECS, ...VISUAL_SPECS],
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
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    // A cold Windows start has to boot next dev and compile the home route.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
