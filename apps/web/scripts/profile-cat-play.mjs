import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.CAT_TEST_URL ?? "http://localhost:3210";
const output = new URL("../../../test-results/cat-play/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const rate of [1, 4]) {
    const page = await browser.newPage({ viewport: rate === 1 ? { width: 1280, height: 900 } : { width: 390, height: 844 }, deviceScaleFactor: rate === 1 ? 2 : 3 });
    await page.goto(`${base}/o-nas`);
    await page.locator('img[src*="/models/our-cat/poster.webp"]').locator("..").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
    const model = page.locator("model-viewer");
    await model.evaluate(async viewer => { viewer.pause(); viewer.currentTime = 0; await viewer.updateComplete;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate });
    const result = await model.evaluate(viewer => {
      const bounds = viewer.getBoundingClientRect();
      let point;
      for (let y = .38; y < .58 && !point; y += .025) for (let x = .38; x < .7; x += .025) {
        const px = bounds.x + bounds.width * x, py = bounds.y + bounds.height * y;
        if (viewer.materialFromPoint(px, py)?.name === "Head touch region") { point = { x: px, y: py }; break; }
      }
      if (!point) throw new Error("No head point");
      const full = [], proxy = [];
      const original = viewer.materialFromPoint.bind(viewer);
      let fullCalls = 0;
      viewer.materialFromPoint = (...args) => { fullCalls++; return original(...args); };
      for (let i = 0; i < 35; i++) {
        let start = performance.now(); original(point.x, point.y);
        if (i >= 5) full.push(performance.now() - start);
        const event = { pointerId: 9, pointerType: "touch", button: 0, clientX: point.x, clientY: point.y };
        viewer.dispatchEvent(new PointerEvent("pointerdown", event));
        start = performance.now(); viewer.dispatchEvent(new PointerEvent("pointerup", event));
        if (i >= 5) proxy.push(performance.now() - start);
      }
      const stats = values => { values.sort((a, b) => a - b); return { medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.floor(values.length * .95)] }; };
      return { fullMeshLookup: stats(full), proxyTapHandler: stats(proxy), fallbackCalls: fullCalls, samples: proxy.length };
    });
    results.push({ cpuRate: rate, ...result });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/o-nas`);
  await page.locator('img[src*="/models/our-cat/poster.webp"]').locator("..").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("model-viewer")?.loaded);
  const model = page.locator("model-viewer");
  await model.evaluate(async viewer => {
    viewer.pause(); viewer.animationCrossfadeDuration = 0; viewer.animationName = "Companion";
    for (const name of ["Gaze left", "Gaze right", "Gaze up", "Gaze down", "Ear left", "Ear right", "Curious tilt left", "Curious tilt right"]) viewer.detachAnimation(name, { fade: false });
    viewer.appendAnimation("Ear right", { weight: .65, timeScale: 0, time: 0 });
    await viewer.updateComplete; viewer.currentTime = 0;
  });
  await model.locator("../..").screenshot({ path: fileURLToPath(new URL("ear-first.png", output)) });
  await model.evaluate(async viewer => {
    viewer.appendAnimation("Gaze right", { weight: .4, timeScale: 0, time: 0 });
    viewer.appendAnimation("Gaze up", { weight: .3, timeScale: 0, time: 0 });
    viewer.appendAnimation("Curious tilt right", { weight: .14, timeScale: 0, time: 0 });
    await viewer.updateComplete; viewer.currentTime = 0;
  });
  await model.locator("../..").screenshot({ path: fileURLToPath(new URL("curious.png", output)) });
  await model.evaluate(async viewer => {
    for (const name of ["Gaze left", "Gaze right", "Gaze up", "Gaze down", "Ear left", "Ear right", "Curious tilt left", "Curious tilt right"]) viewer.detachAnimation(name, { fade: false });
    viewer.animationName = "Playful reach left"; await viewer.updateComplete; viewer.currentTime = 1;
  });
  await model.locator("../..").screenshot({ path: fileURLToPath(new URL("paw-reach.png", output)) });
  await writeFile(new URL("profile.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
