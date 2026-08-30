import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPicker, pickerTrigger } from "./picker";

// The map's two-tap contract, on the projects that actually have a finger.
//
// On a pointer that cannot hover, the first tap on a region names it and the
// second picks it: a tap is the pointing and the pressing at once, and the
// plate draws no region names of its own, so a single-tap pick took a dozen
// shelters out of a shape nothing on screen had named. shelter-map.tsx has the
// whole of the reasoning, and shelter-map.test.tsx pins the mechanism against
// a stubbed matchMedia.
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
 *  says "Vsa zavetišča" until something is picked and "n od m zavetišč" after,
 *  so its own text is the least brittle way to ask whether a tap committed. */
async function scopeLabel(page: Page): Promise<string> {
  return (await pickerTrigger(page).getAttribute("aria-label")) ?? "";
}

test("names a region on the first tap and picks it on the second", async ({
  page,
}) => {
  const dialog = await openPicker(page);
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
    /^(Izbere \d+ zavetiš|Selects \d+ shelter)/,
  );
  // The annotation is aria-hidden, like every annotation on this plate, so the
  // region's own label is the only way the same sentence reaches a screen
  // reader. It has to be there too.
  await expect(centre).toHaveAttribute(
    "aria-label",
    /(Izbere \d+ zavetiš|Selects \d+ shelter)/,
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
  const before = await scopeLabel(page);

  await region(dialog, CENTRE).tap();
  await region(dialog, EAST).tap();

  // Moving a finger to another shape is moving the pointer, not pressing the
  // shape it left.
  expect(await scopeLabel(page)).toBe(before);
});

test("forgets an arming the finger has dragged away from", async ({ page }) => {
  const dialog = await openPicker(page);
  const centre = region(dialog, CENTRE);
  const before = await scopeLabel(page);

  await centre.tap();
  // A finger that moved is not a tap. The plate does not pan, so a drag
  // across it is the page or the sheet under it moving, and the mark the
  // finger started on is no longer the mark it is over. Dispatched rather
  // than dragged, because what is being pinned is the rule the plate keeps,
  // not the browser's gesture recognition.
  await dialog.locator('svg[role="group"]').dispatchEvent("touchmove");

  await centre.tap();

  // The tap after the drag is a fresh first tap, so nothing is committed.
  expect(await scopeLabel(page)).toBe(before);
});
