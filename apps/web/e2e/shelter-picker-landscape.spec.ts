import { expect, test, type Locator, type Page } from "@playwright/test";
import { donePill, openPicker } from "./picker";

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

async function isReachable(pill: Locator): Promise<boolean> {
  return pill.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return hit === el || el.contains(hit);
  });
}

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
  const search = dialog.getByLabel(/Išči zavetišče|Search shelters/);
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

  test("the confirm button is reachable and clickable", async ({ page }) => {
    const dialog = await openPicker(page);
    await assertReachableAndClickable(page, dialog);
  });
});

test.describe("narrow portrait (320x568)", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("the confirm button is reachable and clickable", async ({ page }) => {
    const dialog = await openPicker(page);
    await assertReachableAndClickable(page, dialog);
  });
});
