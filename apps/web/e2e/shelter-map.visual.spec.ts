import { devices, expect, test, type Locator, type Page } from "@playwright/test";

const DEMO_COUNT = 16;
const LINK_DEMO = "Origin distance and municipality connector";

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/map");
  await page.evaluate(() => document.fonts.ready);
  // The fixed Next.js development badge belongs to the test harness, not the
  // gallery. It otherwise lands at a different stitched-image offset as the
  // light and dark sections are scrolled into view.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await page.mouse.move(1, 1);

  const gallery = page.locator("[data-map-gallery]");
  await expect(gallery).toBeVisible();
  await expect(gallery.locator("[data-map-stage='gallery']")).toHaveCount(
    DEMO_COUNT * 2,
  );
  await expect(gallery.locator("[data-map-hillshade]")).toHaveCount(
    DEMO_COUNT * 2,
  );
  await expect(gallery.locator("[data-map-connector]")).toHaveCount(2);
}

async function capture(
  page: Page,
  viewport: "desktop" | "mobile",
  theme: "light" | "dark",
): Promise<void> {
  await openGallery(page);
  const section: Locator = page.locator(
    `[data-map-gallery-theme="${theme}"]`,
  );
  if (viewport === "desktop") {
    const linkDemo = section.locator(`[data-map-demo="${LINK_DEMO}"]`);
    // Set the same React hover state without moving the real cursor into the
    // tall section. A full-element screenshot is stitched while scrolling;
    // leaving the cursor over the gallery can otherwise wake unrelated maps
    // as they pass underneath it and bake incidental callouts into the image.
    await linkDemo.locator("[data-marker-key]").first().dispatchEvent(
      "pointerover",
      { pointerType: "mouse" },
    );
    await expect(linkDemo.locator("[data-map-distance]")).toHaveCount(1);
  }
  await expect(section).toHaveScreenshot(
    `map-gallery-${viewport}-${theme}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  );
}

test.describe("desktop map gallery", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    contextOptions: {
      reducedMotion: "reduce",
      screen: { width: 1440, height: 900 },
    },
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} baseline`, async ({ page }) => {
      await capture(page, "desktop", theme);
    });
  }
});

test.describe("mobile map gallery", () => {
  const pixel = devices["Pixel 7"] as (typeof devices)[string] & {
    screen: { width: number; height: number };
  };
  test.use({
    userAgent: pixel.userAgent,
    viewport: pixel.viewport,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
    contextOptions: {
      reducedMotion: "reduce",
      screen: pixel.screen,
    },
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} baseline`, async ({ page }) => {
      await capture(page, "mobile", theme);
    });
  }
});
