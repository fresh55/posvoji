import { expect, test, type Locator, type Page } from "@playwright/test";
import { donePill, openPicker } from "./picker";
import { isReachable } from "./reach";

// The results footer must remain immediately reachable on short screens,
// whether the list is open or folded. Requiring a scroll to find the action
// would reproduce the audit's missing-completion problem.
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

  await expect(pill).toBeVisible();
  expect(await isReachable(pill)).toBe(true);

  await pill.click();
  await expect(dialog).toBeHidden();
}

test.describe("short landscape (844x390)", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("lands folded, on a map that is a map", async ({ page }) => {
    const dialog = await openPicker(page);

    // A short landscape viewport starts on the full map. The header
    // segments provide an explicit route to the list.
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

    await expect(dialog.locator("[data-picker-sheet]")).toHaveAttribute(
      "data-picker-sheet", "collapsed",
    );
    await assertReachableAndClickable(page, dialog);
  });

  test("keeps the confirm button reachable after opening the short landscape list", async ({ page }) => {
    const dialog = await openPicker(page);

    await dialog.locator("[data-picker-show-list]").click();
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

  test("switches between an unobstructed list and a full map", async ({ page }) => {
    const dialog = await openPicker(page);
    const listView = dialog.locator("[data-picker-panel]");
    const mapView = dialog.locator("[data-map-stage]");
    const showMap = dialog.locator("[data-picker-show-map]");
    const showList = dialog.locator("[data-picker-show-list]");
    await expect(listView).toBeVisible();
    await expect(mapView).toBeHidden();
    await expect(showList).toHaveAttribute("aria-checked", "true");
    expect(await isReachable(showMap)).toBe(true);

    await showMap.click();
    await expect(mapView).toBeVisible();
    await expect(listView).toBeHidden();
    await expect(showMap).toHaveAttribute("aria-checked", "true");
    const box = (await dialog.locator('svg[role="group"]').boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width * 0.6);
    expect(await isReachable(donePill(page))).toBe(true);

    await showList.click();
    await expect(listView).toBeVisible();
    await expect(mapView).toBeHidden();
    expect(await isReachable(donePill(page))).toBe(true);
  });

  test("the confirm button is whole on screen before anything scrolls", async ({
    page,
  }) => {
    await openPicker(page);
    const pill = donePill(page);
    await expect(pill).toBeVisible();

    // No scroll gesture before measuring: completion is a persistent action.
    const box = (await pill.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Whole is not the same as reachable: a box inside the viewport can still
    // have something drawn over it. See reach.ts.
    expect(await isReachable(pill)).toBe(true);
  });
});
