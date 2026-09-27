import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPicker, pickerTrigger, region } from "./picker";
import { touch } from "./touch";

// The map's two-tap contract, on the projects that actually have a finger.
//
// On a pointer that cannot hover, the first tap on a region names it and the
// second picks it. The first tap exposes the full name and the effect of
// selection before committing. shelter-map.test.tsx pins this mechanism
// against a stubbed matchMedia.
//
// What a unit test cannot answer is whether a real touch on a real engine
// still lands there: the gate reads (hover: none) and MouseEvent.detail, both
// of which are properties of the device and the browser rather than of the
// component. So this file runs on mobile-chromium and mobile-webkit (see
// MOBILE_SPECS in playwright.config.ts), where isMobile and hasTouch are on
// and the tap is dispatched as a tap.
//
// Regions and not markers, because a phone's plate draws no markers: at that
// size a coin is smaller than the finger aiming at it, and the map says so
// itself now (markersVisible in shelter-map.tsx).

// The two regions these taps aim at; region() in picker.ts says why these.
const CENTRE = "Osrednjeslovenska";
const EAST = "Savinjska";

/** The picked-shelter count, read off the control that opens the dialog. It
 *  names the full selection after a pick, so it is a stable way to ask
 *  whether a tap committed without depending on map styling. */
async function scopeLabel(page: Page): Promise<string> {
  return (await pickerTrigger(page).getAttribute("aria-label")) ?? "";
}

test("names a region on the first tap and picks it on the second", async ({
  page,
}) => {
  const dialog = await openPicker(page);
  await dialog.locator("[data-picker-show-map]").click();
  const centre = region(dialog, CENTRE);
  const before = await scopeLabel(page);

  await centre.tap();

  // The first tap is the hover this device does not have: a callout with the
  // region's name in it, and no change to the filter.
  await expect(dialog.locator("[data-callout-title]").first()).toBeVisible();
  expect(await scopeLabel(page)).toBe(before);

  // And what the next tap will cost, in words, before it is spent. Naming the
  // shape was only half of what the two-tap gesture promised: a name and two
  // counts describe a region, they do not say that pressing it again takes
  // every shelter in it. The button the arming raises says it, once: a line
  // above it repeating "Še enkrat tapni: Izbere ..." is gone. The count is
  // left to the dataset, the sentence is not, and a region holding a single
  // shelter says the verb alone, since the card above it already counts one.
  const consequence = dialog.locator("[data-map-action]").first();
  await expect(consequence).toBeVisible();
  await expect(consequence).toHaveText(
    /^(Izberi( · \d+ zavetiš\S*)?|Select( · \d+ shelters?)?)$/,
  );
  await expect(dialog.locator("[data-callout-note]")).toHaveCount(0);
  // The annotation is aria-hidden, like every annotation on this plate, so the
  // region's own label is the only way the same sentence reaches a screen
  // reader. It has to be there too.
  await expect(centre).toHaveAttribute(
    "aria-label",
    /(Še enkrat tapni: Izbere \d+ zavetiš|Tap again: Selects \d+ shelter)/,
  );

  await centre.tap();

  // The second tap is the press. Filtering is live, so the trigger's own
  // label is where the consequence shows up.
  await expect
    .poll(() => scopeLabel(page), { timeout: 5000 })
    .not.toBe(before);
});

test("moves the naming to another region instead of picking the first", async ({
  page,
}) => {
  const dialog = await openPicker(page);
  await dialog.locator("[data-picker-show-map]").click();
  const before = await scopeLabel(page);

  await region(dialog, CENTRE).tap();
  await region(dialog, EAST).tap();

  // Moving a finger to another shape is moving the pointer, not pressing the
  // shape it left.
  expect(await scopeLabel(page)).toBe(before);
});

test("forgets an arming the finger has dragged away from", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const dialog = await openPicker(page);
  await dialog.locator("[data-picker-show-map]").click();
  const centre = region(dialog, CENTRE);
  const before = await scopeLabel(page);

  await centre.tap();
  // A finger that moved is not a tap. The plate does not pan, so a drag
  // across it is the page or the sheet under it moving, and the mark the
  // finger started on is no longer the mark it is over. Dispatched rather
  // than dragged, because what is being pinned is the rule the plate keeps,
  // not the browser's gesture recognition. It is still a complete touch
  // event: an empty synthetic touchmove makes browser and sheet listeners
  // reach for changedTouches[0] that does not exist, which tests malformed
  // input and leaves an uncaught error behind instead of testing this rule.
  await dialog.locator('svg[role="group"]').evaluate((plate) => {
    const box = plate.getBoundingClientRect();
    const clientX = box.left + box.width / 2;
    const clientY = box.top + box.height / 2;
    // WebKit exposes the modern Touch constructor but throws when it is
    // called. Its legacy createTouch produces the same browser-owned object;
    // Chromium implements the constructor and has no createTouch.
    const touchDocument = document as Document & {
      createTouch?: (
        view: Window,
        target: EventTarget,
        identifier: number,
        pageX: number,
        pageY: number,
        screenX: number,
        screenY: number,
      ) => Touch;
      createTouchList?: (...touches: Touch[]) => TouchList;
    };
    const touch = touchDocument.createTouch
      ? touchDocument.createTouch(
          window,
          plate,
          1,
          clientX + window.scrollX,
          clientY + window.scrollY,
          clientX,
          clientY,
        )
      : new Touch({
          identifier: 1,
          target: plate,
          clientX,
          clientY,
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 0.5,
        });
    const touches = touchDocument.createTouchList
      ? touchDocument.createTouchList(touch)
      : [touch];
    // WebKit also rejects touch lists passed to the constructor. Start with
    // its real TouchEvent, then attach the browser-created TouchList; the
    // resulting event has the same interface listeners receive from hardware.
    const move = new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperties(move, {
      touches: { value: touches },
      targetTouches: { value: touches },
      changedTouches: { value: touches },
    });
    plate.dispatchEvent(move);
  });

  await centre.tap();

  // The tap after the drag is a fresh first tap, so nothing is committed.
  expect(await scopeLabel(page)).toBe(before);
  expect(pageErrors).toEqual([]);
});

// An empty region has nothing to pick, so a tap on it arms nothing. It still
// has a card: what the ground holds and who answers for it. A mouse raises
// that card by resting on the region, and a finger's leave comes with its
// lift, before the rest is up, so on a phone a tap raised nothing at all.

/** An empty region, and a point on it a finger can land on. Which regions are
 *  empty is a fact about the dataset, so the plate is asked rather than a name
 *  written down. The point is inside the fill and on top there, because a
 *  region is not a rectangle and the middle of its box is often a neighbour. */
async function emptyRegion(
  dialog: Locator,
): Promise<{ name: string; label: string; x: number; y: number }> {
  const found = await dialog.locator('svg[role="group"]').evaluate((plate) => {
    const steps = 16;
    for (const path of plate.querySelectorAll<SVGPathElement>(
      'path[data-region-state="inert"]',
    )) {
      const box = path.getBBox();
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      for (let row = 1; row < steps; row += 1) {
        for (let column = 1; column < steps; column += 1) {
          const local = new DOMPoint(
            box.x + (box.width * column) / steps,
            box.y + (box.height * row) / steps,
          );
          if (!path.isPointInFill(local)) continue;
          const screen = local.matrixTransform(matrix);
          // A finger lands on a whole pixel, so that pixel is what is tested.
          const x = Math.round(screen.x);
          const y = Math.round(screen.y);
          if (document.elementFromPoint(x, y) !== path) continue;
          const label = path.getAttribute("aria-label") ?? "";
          return { name: label.split(":")[0], label, x, y };
        }
      }
    }
    return null;
  });
  expect(found, "no empty region a finger can reach").not.toBeNull();
  return found!;
}

test("names an empty region on a tap and keeps its card up", async ({
  page,
}) => {
  const dialog = await openPicker(page);
  await dialog.locator("[data-picker-show-map]").click();
  const before = await scopeLabel(page);
  const empty = await emptyRegion(dialog);

  await page.touchscreen.tap(empty.x, empty.y);

  const card = dialog.locator("[data-map-callout]");
  await expect(card.locator("[data-callout-title]")).toHaveText(empty.name);
  // The card says what the region's label says, in the same words: the name,
  // what the ground holds, and who answers for it where the coverage table
  // knows. Read off the label, so the dataset decides the words.
  const said = await card
    .locator("[data-callout-title], [data-callout-metadata], [data-callout-note]")
    .allTextContents();
  expect(`${said[0]}: ${said.slice(1).join(". ")}`).toBe(empty.label);
  // Nothing on it to press: there is no pick here for a button to make.
  await expect(dialog.locator("[data-map-action]")).toHaveCount(0);

  // Still up well after the lift and past the dwell, which is where it used to
  // go. A fixed wait, because what is asserted is that nothing happens.
  await page.waitForTimeout(600);
  await expect(card.locator("[data-callout-title]")).toHaveText(empty.name);
  expect(await scopeLabel(page)).toBe(before);

  // The next tap elsewhere takes it down. A live region's arming stands in
  // its place, and still nothing is picked.
  await region(dialog, CENTRE).tap();
  await expect(card.locator("[data-callout-title]")).toHaveText(CENTRE);
  expect(await scopeLabel(page)).toBe(before);
});

test.describe("under real touch points", () => {
  // Dispatched over a CDP session, which only Chromium speaks.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the touch points are dispatched over a CDP session, which is Chromium only",
  );

  test("keeps the card a held finger raised through the lift", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    await dialog.locator("[data-picker-show-map]").click();
    const empty = await emptyRegion(dialog);
    const card = dialog.locator("[data-map-callout]");
    const cdp = await page.context().newCDPSession(page);

    await touch(cdp, "touchStart", [{ x: empty.x, y: empty.y, id: 1 }]);
    // Held past the dwell, so the card comes up under the finger.
    await expect(card.locator("[data-callout-title]")).toHaveText(empty.name);
    // Marked by hand, which React does not manage: a card taken down and
    // drawn again comes back as a new node without the mark.
    await card.evaluate((node) => node.setAttribute("data-held", ""));
    // A longer press is where the card blinked: the lift's leave took it down
    // and the click after it put it back up.
    await page.waitForTimeout(500);
    await touch(cdp, "touchEnd", []);

    await page.waitForTimeout(600);
    await expect(dialog.locator("[data-map-callout][data-held]")).toHaveCount(1);
    await expect(card.locator("[data-callout-title]")).toHaveText(empty.name);
  });
});
