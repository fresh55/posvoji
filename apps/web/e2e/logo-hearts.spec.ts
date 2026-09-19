import { expect, test } from "@playwright/test";

test("one burst finishes after pointer exit without moving the header or stacking", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.locator("[data-brand]");
  const hearts = brand.locator("[data-logo-hearts]");
  const source = await (await page.request.get("/logo.svg")).text();
  const sourceHeart = await page.evaluate((xml) =>
    new DOMParser().parseFromString(xml, "image/svg+xml")
      .querySelector("g[fill] path")?.getAttribute("d"), source);
  expect(await hearts.locator("path").first().getAttribute("d")).toBe(sourceHeart);
  const bounds = await brand.boundingBox();
  await expect(hearts).not.toHaveAttribute("data-playing");
  await brand.hover();
  await expect(hearts).toHaveAttribute("data-playing", "true");
  const starts = await hearts.evaluate(async (el) => {
    const animations = el.getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.ready));
    return animations.map((animation) => animation.startTime);
  });
  expect(starts).toHaveLength(6);
  await page.mouse.move(400, 200);
  await expect(hearts).toHaveAttribute("data-playing", "true");
  await brand.hover();
  expect(await hearts.evaluate((el) => el.getAnimations({ subtree: true }).map((a) => a.startTime))).toEqual(starts);
  await expect(hearts).not.toHaveAttribute("data-playing", { timeout: 3000 });
  expect(await brand.boundingBox()).toEqual(bounds);
  expect(await hearts.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", "none");
  // Holding hover leaves the logo at rest; it is not a repeating effect.
  await expect(hearts.locator("path").first()).toHaveCSS("opacity", "0");
});

test("keyboard focus triggers the same decoration while the brand remains a home link", async ({ page }) => {
  await page.goto("/o-nas", { waitUntil: "networkidle" });
  const brand = page.locator("[data-brand]");
  await page.keyboard.press("Tab"); // Skip link.
  await page.keyboard.press("Tab"); // Brand link.
  await expect(brand).toBeFocused();
  await expect(brand.locator("[data-logo-hearts]")).toHaveAttribute("data-playing", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
});

test("reduced motion prevents a burst and cancels one already running", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.locator("[data-brand]");
  const hearts = brand.locator("[data-logo-hearts]");
  await brand.hover();
  await expect(hearts).not.toHaveAttribute("data-playing");
  await expect(hearts).toHaveCSS("display", "none");
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(400, 200);
  await brand.hover();
  await expect(hearts).toHaveAttribute("data-playing", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hearts).not.toHaveAttribute("data-playing");
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", "none");
  expect(await hearts.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
});

test("touch does not start hover decoration and print stays static", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.locator("[data-brand]");
  const hearts = brand.locator("[data-logo-hearts]");
  await brand.dispatchEvent("pointerenter", { pointerType: "touch" });
  await expect(hearts).not.toHaveAttribute("data-playing");
  await brand.hover();
  await expect(hearts).toHaveAttribute("data-playing", "true");
  await expect(hearts).toHaveCSS("pointer-events", "none");
  await page.emulateMedia({ media: "print" });
  await expect(hearts).toHaveCSS("display", "none");
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", "none");
});

test("the cat blinks before the hearts start, using the original eye geometry", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.locator("[data-brand]");
  const hearts = brand.locator("[data-logo-hearts]");
  const eyes = hearts.locator("[data-logo-eyes]");
  const source = await (await page.request.get("/logo.svg")).text();
  expect(source).toContain(await eyes.locator("path").getAttribute("d"));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await brand.hover();
  await hearts.evaluate(async (el) => {
    const animations = el.getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.ready));
    animations.forEach((animation) => { animation.pause(); animation.currentTime = 100; });
  });
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", /polygon/);
  await expect(eyes).toHaveCSS("opacity", "1");
  expect(await eyes.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m22)).toBeCloseTo(0.1);
  await expect(hearts.locator("path").first()).toHaveCSS("opacity", "0");
  await hearts.evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 300; }));
  expect(await eyes.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m22)).toBeCloseTo(1);
  expect(Number(await hearts.locator("path").first().evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0);
  await page.clock.fastForward(1400);
  await expect(brand.locator("[data-logo-mark]")).toHaveCSS("clip-path", "none");
});
