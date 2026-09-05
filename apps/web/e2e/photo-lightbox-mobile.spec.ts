import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import {
  dialog,
  frontPrint,
  KLOPKA,
  KLOPKA_PHOTOS,
  lightbox,
  openFan,
} from "./fan";
import { dragTouch, touch } from "./touch";

// The lightbox's touch gestures: the pinch, the pan it leaves behind, and the
// pull down that throws the photo away.
//
// None of it can be pinned anywhere but here. jsdom runs no frame loop, so the
// unit suite can only read the fact the view branches on (data-zoomed) and the
// callbacks; two fingers on the glass at once is a browser's input pipeline
// rather than a pair of dispatched events; and touch-action: none, which is
// what keeps the browser's own pinch off the page, is a compositor decision
// made before any handler runs.

// Every gesture here is dispatched over CDP, which only Chromium speaks. The
// mobile-webkit project runs the same file list and has no session to open.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "the touch points are dispatched over a CDP session, which is Chromium only",
);

// The opening morph is a spring, and every gesture measures the box it starts
// in. Nothing here waits for anything else.
const MORPH_SETTLE_MS = 600;

function photoBox(page: Page): Locator {
  return page.locator('[data-slot="photo-lightbox-photo"]');
}

function counter(page: Page): Locator {
  return lightbox(page).locator('[data-slot="badge"]');
}

/** The line the lightbox draws over the scrim for a photo that never came. */
function unavailable(page: Page): Locator {
  return page.locator('[data-slot="photo-lightbox-unavailable"]');
}

/** The full-screen view, opened from the print in front of the phone fan. */
async function openLightbox(page: Page): Promise<{
  cdp: CDPSession;
  centre: { x: number; y: number };
  box: { x: number; y: number; width: number; height: number };
}> {
  const fan = await openFan(page, KLOPKA, { layout: "phone" });
  await frontPrint(fan).tap();
  await expect(lightbox(page)).toBeVisible();
  await page.waitForTimeout(MORPH_SETTLE_MS);

  const box = await photoBox(page).boundingBox();
  if (!box) throw new Error("the lightbox has no photo box to gesture over");
  return {
    cdp: await page.context().newCDPSession(page),
    centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    box,
  };
}

test("zooms the photograph on a pinch rather than the page", async ({
  page,
}) => {
  const { cdp, centre } = await openLightbox(page);

  // The browser's own two-finger gesture, synthesized: the point of this test
  // is that a pinch reaches the lightbox's handlers at all, and a pair of
  // dispatched touch points would only prove that the handlers do arithmetic.
  // gestureSourceType is not optional in practice: left to itself the headless
  // browser sends the gesture as a mouse one, which is ctrl and a wheel, and
  // no finger ever touches the photo.
  await cdp.send("Input.synthesizePinchGesture", {
    x: Math.round(centre.x),
    y: Math.round(centre.y),
    scaleFactor: 2,
    relativeSpeed: 400,
    gestureSourceType: "touch",
  });

  await expect(photoBox(page)).toHaveAttribute("data-zoomed", "true");
  // The page itself never moves: touch-action: none on the photo box is what
  // hands the gesture over, and the layer is fixed with nothing behind it.
  const scroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  expect(scroll).toEqual({ x: 0, y: 0 });

  // Zoomed in, one finger moves the photograph. The same drag that closes the
  // lightbox at the normal size is a pan here, and the visitor stays inside
  // the picture they went to the trouble of magnifying.
  await dragTouch(page, cdp, centre, { x: centre.x, y: centre.y + 200 });

  await expect(lightbox(page)).toBeVisible();
  await expect(photoBox(page)).toHaveAttribute("data-zoomed", "true");
  await expect(counter(page)).toHaveText(`1 / ${KLOPKA_PHOTOS}`);
});

test("closes on a pull down and leaves the animal open", async ({ page }) => {
  const { cdp, centre } = await openLightbox(page);

  // Past PULL_CLOSE_PX, which is 100.
  await dragTouch(page, cdp, centre, { x: centre.x, y: centre.y + 200 });

  await expect(lightbox(page)).toBeHidden();
  // The dialog under it is a separate Radix layer, and only the top one was
  // being thrown away. Its open state and not its visibility: a dialog on its
  // way out is still visible for the length of its exit animation, which is
  // exactly how a pull that closed both of them once passed here.
  await expect(dialog(page)).toHaveAttribute("data-state", "open");
  await page.waitForTimeout(MORPH_SETTLE_MS);
  await expect(dialog(page)).toBeVisible();
});

test("carries the photo and the scrim with a pull that does not commit", async ({
  page,
}) => {
  const { cdp, centre } = await openLightbox(page);

  // Held rather than released: what is being pinned is the follow, which only
  // exists while the finger is down.
  await touch(cdp, "touchStart", [{ x: centre.x, y: centre.y, id: 1 }]);
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(20);
    await touch(cdp, "touchMove", [
      { x: centre.x, y: centre.y + i * 20, id: 1 },
    ]);
  }

  const held = await page.evaluate(() => {
    const overlays = document.querySelectorAll('[data-slot="dialog-overlay"]');
    // The animal dialog's own scrim is the first; the lightbox is the layer on
    // top and so the last.
    const scrim = overlays[overlays.length - 1];
    const inner = document.querySelector('[data-slot="photo-lightbox-photo"]')
      ?.firstElementChild;
    return {
      scrim: scrim ? Number(getComputedStyle(scrim).opacity) : 1,
      transform: inner ? getComputedStyle(inner).transform : "none",
    };
  });

  // 80px of the 200 the fade runs over: the photo has come down with the
  // finger and shrunk, and the ground behind it has started to go.
  expect(held.transform).toBe("matrix(0.96, 0, 0, 0.96, 0, 80)");
  expect(held.scrim).toBeLessThan(1);
  expect(held.scrim).toBeGreaterThan(0.3);

  await touch(cdp, "touchEnd", []);

  // Short of PULL_CLOSE_PX, so it springs back rather than closing.
  await expect(lightbox(page)).toBeVisible();
});

// A photo that never arrives takes itself out of its box, and the failure is
// written to the <img> rather than to state. The set is stepped through one
// element, so the flag has to leave with the file it was about: once, a single
// missing photo left every healthy one after it hidden.
//
// Only a browser can pin this. jsdom fetches nothing, so the unit suite can
// prove the flag moves but not that a photo which really failed and one that
// really loads are told apart.
test("draws the photo after one that could not be fetched", async ({
  page,
}) => {
  const { cdp } = await openLightbox(page);
  await cdp.send("Network.enable");

  try {
    await cdp.send("Network.setBlockedURLs", { urls: ["*/media/animals/*"] });

    // Nine of fourteen: past the five prints the fan seats, so this photo has
    // not been fetched yet and the block is what it meets.
    await page.keyboard.press("9");
    await expect(counter(page)).toHaveText(`9 / ${KLOPKA_PHOTOS}`);
    await expect(unavailable(page)).toBeVisible();

    await cdp.send("Network.setBlockedURLs", { urls: [] });
    await page.keyboard.press("ArrowRight");

    await expect(counter(page)).toHaveText(`10 / ${KLOPKA_PHOTOS}`);
    await expect(unavailable(page)).toBeHidden();
    // Visible rather than present: a photo carrying the failure of the one
    // before it is hidden, which is exactly the shape of the defect.
    const drawn = photoBox(page).locator("img");
    await expect(drawn).toBeVisible();
    await expect
      .poll(() =>
        drawn.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(lightbox(page)).toBeVisible();
  } finally {
    // The block belongs to this test whatever it did with it, and the session
    // outlives the assertions above.
    await cdp.send("Network.setBlockedURLs", { urls: [] }).catch(() => {});
    await cdp.send("Network.disable").catch(() => {});
  }
});

test("still steps the photo on a sideways swipe", async ({ page }) => {
  const { cdp, centre, box } = await openLightbox(page);

  await expect(counter(page)).toHaveText(`1 / ${KLOPKA_PHOTOS}`);

  // Past SWIPE_DISTANCE_PX, which is 48, and along the axis the pull is not.
  await dragTouch(page, cdp, centre, {
    x: centre.x - Math.min(150, box.width / 3),
    y: centre.y,
  });

  await expect(counter(page)).toHaveText(`2 / ${KLOPKA_PHOTOS}`);
  await expect(lightbox(page)).toBeVisible();
});
