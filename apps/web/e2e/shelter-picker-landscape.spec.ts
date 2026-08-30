import { expect, test, type Locator, type Page } from "@playwright/test";
import { donePill, openPicker } from "./picker";
import { isReachable } from "./reach";

// Regression cover for the fix that lets the picker's own content column
// scroll to its footer on a viewport too short for the sheet's fixed chrome
// (peek bar, tabs, search box, list) to fit above it. Before the fix that
// column had no overflow of its own, so the confirm button ("Pokaži X
// živali") -- and on the narrowest screens the list itself -- sat clipped off
// the bottom of the sheet with nothing on screen able to scroll to it. See
// location-picker.tsx, the column whose comment starts "overflow-y-auto is
// the floor under all of that", and the sheet height's own note on a short
// landscape phone in filter-sheet.tsx.
//
// Both viewports below are real device shapes and not arbitrary points: a
// phone held sideways is 390px tall (this repo's own convention, see
// filter-sheet.tsx), and 320x568 is the narrowest phone still worth
// supporting (the sheet-height comment's own worst case).

async function assertReachableAndClickable(
  page: Page,
  dialog: Locator,
): Promise<void> {
  const pill = donePill(page);

  // A genuine scroll gesture, not scrollIntoViewIfNeeded: that helper walks
  // up to the nearest ancestor that establishes a scrolling box and sets its
  // scrollTop directly, and overflow-hidden still establishes one -- it only
  // refuses a user's own input. The bug this guards was exactly that gap:
  // the column's content overflowed a hidden box with nothing a real scroll
  // gesture could move, so the fix has to be exercised the same way.
  //
  // Keyboard PageDown rather than a wheel: page.mouse.wheel is unsupported
  // in mobile WebKit (real phones have no wheel either), while a keydown on
  // a focused control inside the column scrolls its nearest native scroll
  // container the same way a wheel or a touch drag would, on every engine
  // this suite runs.
  const search = dialog.getByLabel(
    /Kraj, pošta ali zavetišče|Town, postcode or shelter/,
  );
  await search.focus();
  for (let i = 0; i < 10 && !(await isReachable(pill)); i += 1) {
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(50);
  }

  expect(await isReachable(pill)).toBe(true);

  await pill.click();
  await expect(dialog).toBeHidden();
}

test.describe("short landscape (844x390)", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("lands folded, on a map that is a map", async ({ page }) => {
    const dialog = await openPicker(page);

    // The sheet costs this viewport everything: open, it leaves the plate
    // 767x21, which is a country drawn as a line. So it lands folded here,
    // and the strip it folds to is the whole of the way back. See the
    // landing effect in location-picker.tsx.
    await expect(dialog.locator("[data-picker-sheet]")).toHaveAttribute(
      "data-picker-sheet",
      "collapsed",
    );

    // And the plate has a usable height rather than a nominal one. Measured
    // against what the map is for: a 320:210 country at 100px of height is
    // 152px of country, which a finger can aim at; at 21 it is not a map.
    const plate = dialog.locator('svg[role="group"]');
    const box = (await plate.boundingBox())!;
    expect(box.height).toBeGreaterThan(100);
  });

  test("the confirm button is reachable and clickable", async ({ page }) => {
    const dialog = await openPicker(page);

    // One press in front of what this file has always asserted, because the
    // sheet is where the confirm button lives and the sheet lands folded on
    // this viewport now. What is being pinned is unchanged: with the sheet up
    // on a screen this short, the column's own scroll is the only way to the
    // button, and that scroll is what regressed once.
    await dialog.locator("[data-picker-peek]").click();
    await expect(dialog.locator("[data-picker-sheet]")).toHaveAttribute(
      "data-picker-sheet",
      "open",
    );

    await assertReachableAndClickable(page, dialog);
  });
});

test.describe("narrow portrait (320x568)", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("the confirm button is reachable and clickable", async ({ page }) => {
    const dialog = await openPicker(page);
    await assertReachableAndClickable(page, dialog);
  });

  test("keeps a map worth looking at under the sheet", async ({ page }) => {
    const dialog = await openPicker(page);

    // The sheet stays open on this one: it is not short, it is narrow, and
    // the list is what a 320px screen came for. What changed is what the
    // stage keeps for the map, which used to be the caption alone and left
    // the plate 283x69: a country at a third of its own proportions. The
    // reserve is the plate plus the caption now (see --sheet-reserve), so
    // the plate is drawn whole and the sheet gives up the difference.
    await expect(dialog.locator("[data-picker-sheet]")).toHaveAttribute(
      "data-picker-sheet",
      "open",
    );

    const box = (await dialog.locator('svg[role="group"]').boundingBox())!;
    // Whole, within the rounding a letterbox does: 210/320 of the width it
    // is given. Anything under that is a plate the height has clipped.
    expect(box.height).toBeGreaterThan(box.width * 0.6);
  });

  test("the confirm button is whole on screen before anything scrolls", async ({
    page,
  }) => {
    await openPicker(page);
    const pill = donePill(page);
    await expect(pill).toBeVisible();

    // No scroll gesture in front of this one. The chrome above the pill runs
    // about 25px past what this viewport can seat, so in flow the picker
    // opened with the button already cut off at the sheet's bottom edge and
    // the only way to read it was to scroll to it. The footer is sticky to
    // the foot of the column now, so it is whole the moment the dialog is
    // open. The test above still exercises the scroll itself, which is what
    // catches the column losing its overflow.
    const box = (await pill.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Whole is not the same as reachable: a box inside the viewport can still
    // have something drawn over it. See reach.ts.
    expect(await isReachable(pill)).toBe(true);
  });
});
