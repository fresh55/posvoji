import { expect, test } from "@playwright/test";

// Separate from behavioural tests: deterministic poses, fixed orbit, no motion.
test("cat face, eyelids, tail clearance and sleep retain their reviewed appearance", async ({ page }, info) => {
  test.skip(info.project.name !== "cat-desktop", "One stable desktop baseline; mobile gets functional checks.");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/o-nas");
  await page.locator('img[src*="/models/our-cat/poster.webp"]').locator("..").scrollIntoViewIfNeeded();
  const model = page.locator("model-viewer");
  await model.scrollIntoViewIfNeeded();
  await expect.poll(() => model.evaluate(v => (v as import("@google/model-viewer").ModelViewerElement).loaded)).toBe(true);
  // Preserve the reviewed fractional-pixel crop without changing CSS size or
  // camera framing. Integer page offsets otherwise shave one row off on Windows.
  await model.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    (element as HTMLElement).style.transform = `translateY(${Math.ceil(top) + .5 - top}px)`;
  });
  for (const [name, time, orbit] of [
    ["Companion", 0, "-19deg 81deg 1.45m"],
    ["Slow blink", 1.1, "-19deg 81deg 1.45m"],
    ["Face wash", 3.25, "-19deg 81deg 1.45m"],
    ["Back pet", .9, "65deg 81deg 1.45m"],
    ["Back warning", 1.25, "145deg 75deg 1.45m"],
    ["Head pet", 1.2, "-19deg 81deg 1.45m"],
    ["Head rub", 1.6, "-19deg 81deg 1.45m"],
    ["Nose sniff", .18, "-19deg 81deg 1.45m"],
    ["Paw withdraw front left", .9, "-19deg 81deg 1.45m"],
    ["Paw withdraw front right", .9, "-19deg 81deg 1.45m"],
    ["Paw withdraw rear left", .9, "65deg 81deg 1.45m"],
    ["Paw withdraw rear right", .9, "-65deg 81deg 1.45m"],
    ["Sleep", 2, "-19deg 81deg 1.45m"],
    ["Stretch", 1.75, "-19deg 81deg 1.45m"],
    ["Playful reach left", 1, "-19deg 81deg 1.45m"],
  ] as const) {
    await model.evaluate(async (element, pose) => {
      const v = element as import("@google/model-viewer").ModelViewerElement;
      v.pause(); v.animationCrossfadeDuration = 0; v.currentTime = 0;
      v.animationName = pose.name; v.cameraOrbit = pose.orbit; v.jumpCameraToGoal();
      await v.updateComplete; v.currentTime = pose.time; await v.updateComplete;
    }, { name, time, orbit });
    await expect(model).toHaveScreenshot(`${name.toLowerCase().replaceAll(" ", "-")}.png`);
  }
});
