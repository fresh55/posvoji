import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPicker, pickerTrigger } from "./picker";

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

/** A live region on the plate, by name. The ones that carry a click to commit
 *  are the ones with a commit key, which is the same attribute the arming
 *  reads, and the label is what a screen reader is told they are.
 *
 *  Named rather than taken by index, because index order is the order
 *  lib/region-shapes.ts lists them in and that puts Pomurska first, in the
 *  top-right corner of the plate under the dialog's own close button. The two
 *  below sit in the middle of the country, clear of the title chip on one
 *  corner and the close on the other, and both hold shelters in every dataset
 *  this suite runs against: Ljubljana and Celje. */
function region(dialog: Locator, name: string): Locator {
  return dialog.locator(
    `[data-map-commit^="region:"][aria-label^="${name}"]`,
  );
}

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
  // every shelter in it. The count is left to the dataset, the sentence is
  // not.
  const consequence = dialog.locator("[data-callout-note]").first();
  await expect(consequence).toBeVisible();
  await expect(consequence).toHaveText(
    /^(Še enkrat tapni: Izbere \d+ zavetiš|Tap again: Selects \d+ shelter)/,
  );
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
