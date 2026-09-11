import { devices, expect, test, type Locator, type Page } from "@playwright/test";

// The grid card, every shape it takes, in both themes and at both widths.
//
// The card was redesigned as a borderless surface: the photo is the only box
// on it, rounded at 14px, the words set flush under it, and the keyboard's
// focus ring drawn as an inset ring on a ::after inside the photo frame
// (PHOTO_FRAME in components/animal-card.tsx). None of that was covered by a
// snapshot, so CI would have watched all of it change and said nothing.
//
// The fixtures are the dev-only gallery at app/dev/cards, not the dataset: CI
// runs this config with no data/dist and no /media, the same reason the map
// gallery next door draws from a fixture of its own.

const CARD_COUNT = 8;
const LIGHT = '[data-card-gallery-theme="light"]';
const DARK = '[data-card-gallery-theme="dark"]';

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/cards");
  await page.evaluate(() => document.fonts.ready);
  // The fixed Next.js development badge belongs to the test harness, not the
  // gallery. Hidden rather than ignored: a full-element screenshot is stitched
  // while the section is scrolled, so the badge otherwise lands at a different
  // offset in each of the three images. display:none also takes it out of the
  // tab order, which the keyboard test below depends on.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  // Away from the grid. The photo lifts on hover (photo-gallery.tsx) and the
  // shelter row reveals its chevron, and a cursor resting anywhere over the
  // section bakes one card's hover state into the image.
  await page.mouse.move(1, 1);

  await expect(page.locator("[data-card-gallery]")).toBeVisible();
  await expect(page.locator(`${LIGHT} article`)).toHaveCount(CARD_COUNT);
  await expect(page.locator(`${DARK} article`)).toHaveCount(CARD_COUNT);
  await photosReady(page);
}

/** Every card photo decoded. The plates are inline `data:` URIs, so nothing
 *  leaves the page, but an <img> still paints in two steps and a screenshot
 *  taken between them is a card with an empty frame. */
async function photosReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const photos = Array.from(
      document.querySelectorAll<HTMLImageElement>("[data-card-gallery] img"),
    );
    return (
      photos.length > 0 &&
      photos.every((photo) => photo.complete && photo.naturalWidth > 0)
    );
  });
}

async function capture(page: Page, name: string, section: Locator): Promise<void> {
  await expect(section).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
}

/** The first card link the tab order reaches, and how many presses it took.
 *
 *  Driven by real key presses rather than `.focus()`, because `:focus-visible`
 *  is the assertion: a programmatic focus on an anchor does not match it, and
 *  the ring the card draws is gated on exactly that.
 *
 *  One press should do it. The photo's own anchor and the gallery chevrons are
 *  all tabIndex -1 on a card, which is the contract this walk also checks: a
 *  card that put either back in the tab order would be found here. */
async function tabToCardLink(page: Page): Promise<number> {
  for (let presses = 1; presses <= 12; presses += 1) {
    await page.keyboard.press("Tab");
    const arrived = await page.evaluate(
      () => document.activeElement?.getAttribute("data-slot") === "card-link",
    );
    if (arrived) return presses;
  }
  throw new Error("Tab never reached a [data-slot='card-link']");
}

/** The shelter row's box, which is 44px for a thumb and only the line for a
 *  mouse (pointer-coarse:min-h-11 in animal-card.tsx). The row is the one
 *  anchor on a card marked data-press-exempt, because it leaves for another
 *  page rather than opening this animal. */
function shelterRow(card: Locator): Locator {
  return card.locator("a[data-press-exempt]");
}

async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("the shelter row has no box");
  return box.height;
}

test.describe("desktop card grid", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    contextOptions: {
      reducedMotion: "reduce",
      screen: { width: 1440, height: 900 },
    },
  });

  test("light baseline", async ({ page }) => {
    await openGallery(page);
    await capture(page, "grid-desktop-light.png", page.locator(LIGHT));
  });

  test("dark baseline", async ({ page }) => {
    await openGallery(page);
    await capture(page, "grid-desktop-dark.png", page.locator(DARK));
  });

  test("draws the focus ring inside the photo frame", async ({ page }) => {
    await openGallery(page);

    const presses = await tabToCardLink(page);
    expect(presses).toBe(1);

    const card = page.locator(`${LIGHT} article`).first();
    // The walk landed on this card and not on some other focusable the page
    // grew, which is what makes the ring measured below this card's ring.
    await expect(card.locator('[data-slot="card-link"]')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.activeElement?.matches(":focus-visible") ?? false,
      ),
    ).toBe(true);

    // The ring's colour as the page resolves it, off an element styled with
    // the same token the ring is drawn in. Read this way rather than by
    // matching the --ring string, because the two spellings differ: the
    // custom property comes back as "lab(45.7785% -35.1527 22.0894)" and the
    // shadow's own colour as the same numbers without the per cent sign. The
    // token is still read, to catch a --ring that resolves to nothing at all.
    const ring = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-ring";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return {
        colour,
        token: getComputedStyle(document.documentElement)
          .getPropertyValue("--ring")
          .trim(),
      };
    });
    expect(ring.token).not.toBe("");

    // On the frame's ::after and not on the link, which is what PHOTO_FRAME
    // exists for: an inset shadow on the article was painted under its own
    // children, and an outline on the frame computed but never showed,
    // because the photo is positioned inside it and paints after it. Both
    // failures compute as a focused card with no visible ring, which is the
    // case this assertion is here to catch.
    const shadow = await card
      .locator('[data-slot="photo-frame"]')
      .evaluate((frame) => getComputedStyle(frame, "::after").boxShadow);
    expect(shadow).not.toBe("none");
    expect(shadow).toContain(ring.colour);
    // Inset, so all three pixels stay on the picture rather than reaching
    // outside a box that card-paint clips (globals.css).
    expect(shadow).toContain("inset");

    // A mouse gets the row it is drawn with and no thumb allowance. 34px
    // here, against the 44 a coarse pointer is given below.
    expect(await heightOf(shelterRow(card))).toBeLessThan(44);

    await expect(card).toHaveScreenshot("grid-card-focus.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  });
});

test.describe("mobile card grid", () => {
  const pixel = devices["Pixel 7"] as (typeof devices)[string];
  // The Pixel 7 context, at 390 rather than at its own 412. The device is here
  // for isMobile and hasTouch, which is what turns `pointer: coarse` on and so
  // is what makes the shelter row draw its 44px box; a desktop browser
  // narrowed to a phone's width has neither. The width is the narrow end of
  // the site's phone band, where the two-column grid has the least room and
  // the card is likeliest to push the page sideways.
  test.use({
    userAgent: pixel.userAgent,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
    contextOptions: {
      reducedMotion: "reduce",
      screen: { width: 390, height: 844 },
    },
  });

  test("light baseline", async ({ page }) => {
    await openGallery(page);

    // Nothing on a card may push the page sideways. The shelter name and the
    // long two-line name are the two fixtures that would: both are told to
    // truncate or clamp, and a card that stopped doing either shows up here
    // before it shows up in the image.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      390,
    );

    // A thumb's target, on the one row of a card that leaves for another page.
    const card = page.locator(`${LIGHT} article`).first();
    expect(await heightOf(shelterRow(card))).toBe(44);

    await capture(page, "grid-mobile-light.png", page.locator(LIGHT));
  });
});
