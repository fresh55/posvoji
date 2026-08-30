import { defineConfig, devices } from "@playwright/test";
import baseConfig, { PLAYWRIGHT_BASE_URL } from "./playwright.config";

const sharedWebServer = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer[0]
  : baseConfig.webServer;

if (!sharedWebServer) {
  throw new Error("The shared Playwright dev server configuration is missing");
}

// The visual gallery has no dependency on data/dist/animals.json. Keep its
// run separate from the behavioural suite so CI can exercise this dev-only
// fixture without manufacturing a production dataset, while inheriting the
// same server, port, timeouts, retries and reporter as every other browser
// test.
export default defineConfig({
  ...baseConfig,
  globalSetup: [],
  // The checked-in baselines were authored on Windows but CI renders them on
  // Linux. Keep one neutral path and allow a small share of rasterization
  // differences while still failing on a material gallery change.
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  expect: {
    ...baseConfig.expect,
    toHaveScreenshot: { maxDiffPixelRatio: 0.05 },
  },
  // The full site readiness probe needs generated animal data. This gallery
  // is intentionally fixture-free, so wait for the route under test itself.
  webServer: {
    ...sharedWebServer,
    url: `${PLAYWRIGHT_BASE_URL}/dev/map`,
  },
  projects: [
    {
      name: "map-visual",
      testMatch: "shelter-map.visual.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...baseConfig.use,
        colorScheme: "light",
        contextOptions: {
          ...baseConfig.use?.contextOptions,
          reducedMotion: "reduce",
        },
      },
    },
  ],
});
