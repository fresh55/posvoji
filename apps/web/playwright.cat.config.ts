import { defineConfig, devices } from "@playwright/test";
import shared, { PLAYWRIGHT_BASE_URL } from "./playwright.config";

const external = process.env.CAT_TEST_URL;
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["cat-hardening.spec.ts", "cat-visual.spec.ts"],
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: .02 } },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  reporter: "list",
  use: { baseURL: external ?? PLAYWRIGHT_BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "cat-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "cat-android", use: { ...devices["Pixel 7"] } },
    { name: "cat-webkit", use: { ...devices["iPhone 14"] } },
  ],
  webServer: external ? undefined : shared.webServer,
});
