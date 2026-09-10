import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? "test-results/cat-back");
const clip = process.argv[3] ?? "Back warning";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${process.env.CAT_TEST_URL ?? "http://localhost:3210"}/o-nas`);
  await page.locator('img[src*="/models/our-cat/poster.webp"]').locator("..").scrollIntoViewIfNeeded();
  const model = page.locator("model-viewer");
  await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
  for (const [name, time, orbit] of [
    ["neutral", 0, "-19deg 81deg 1.45m"],
    ["flinch", .17, "-19deg 81deg 1.45m"],
    ["annoyed-look", .9, "-19deg 81deg 1.45m"],
    ["back-view", .9, "145deg 75deg 1.45m"],
    ["side-view", .9, "65deg 81deg 1.45m"],
    ["settled", 3.5, "-19deg 81deg 1.45m"],
  ]) {
    await model.evaluate(async (v, { time, orbit, clip }) => {
      v.pause(); v.animationCrossfadeDuration = 0; v.currentTime = 0;
      v.animationName = clip; v.cameraOrbit = orbit; v.jumpCameraToGoal();
      await v.updateComplete; v.currentTime = Math.min(time, v.duration); await v.updateComplete;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { time, orbit, clip });
    await model.screenshot({ path: resolve(output, `${name}.png`) });
  }
  console.log(output);
} finally { await browser.close(); }
