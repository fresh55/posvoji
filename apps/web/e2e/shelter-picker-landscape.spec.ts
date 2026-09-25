import { expect, test, type Locator, type Page } from "@playwright/test";
import { donePill, openPicker, region, ROW } from "./picker";
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

  test("stands the list beside a map that is a map", async ({ page }) => {
    const dialog = await openPicker(page);

    // Sideways the width is there for both, so both are on screen at once and
    // nothing takes turns: no Seznam / Zemljevid switch. It used to draw a
    // 300px country alone in an 800px dialog, with the list a tab away.
    await expect(dialog.locator("[data-map-stage]")).toBeVisible();
    await expect(dialog.locator("[data-picker-sheet]")).toBeVisible();
    await expect(dialog.locator("[data-picker-view-switch]")).toBeHidden();
    const plate = (await dialog.locator('svg[role="group"]').boundingBox())!;
    const list = (await dialog.locator("[data-picker-sheet]").boundingBox())!;
    expect(plate.x + plate.width).toBeLessThanOrEqual(list.x + 1);

    // And the plate has a usable height rather than a nominal one. Measured
    // against what the map is for: a 320:210 country at 100px of height is
    // 152px of country, which a finger can aim at; at 21 it is not a map.
    // Wide enough for the region names, which a nameless country lacked.
    expect(plate.height).toBeGreaterThan(100);
    await expect(dialog.locator("[data-map-region-label]").first()).toBeVisible();
    // Nor does the plate print type too small to read: the neighbour names
    // go with the coins on a plate this size.
    await expect(dialog.locator("[data-map-neighbor]").first()).toBeHidden();
  });

  test("the confirm button is reachable and clickable", async ({ page }) => {
    const dialog = await openPicker(page);
    await assertReachableAndClickable(page, dialog);
  });

  test("reads a pick on the map off the list beside it", async ({ page }) => {
    const dialog = await openPicker(page);

    // A finger's map: the first tap names the region, and the button it
    // raises takes the pick (shelter-picker-touch.spec.ts pins the pair).
    await region(dialog, "Osrednjeslovenska").tap();
    await dialog.locator("[data-map-action]").first().tap();

    // Answered in the list standing beside the map, with no switch pressed.
    const picked = dialog
      .locator("[data-picker-sheet]")
      .locator(`${ROW}[aria-pressed="true"]`);
    await expect(picked.first()).toBeVisible();
    await expect(dialog.locator("[data-map-stage]")).toBeVisible();
    await assertReachableAndClickable(page, dialog);
  });
});

test.describe("tablet held upright (768x1024)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("opens on the map, which writes its counts", async ({ page }) => {
    const dialog = await openPicker(page);

    // The map is the way in wherever it can count every shelter. It opened on
    // its list here, eleven rows in two columns over 250px of empty dialog.
    await expect(dialog.locator("[data-map-stage]")).toBeVisible();
    await expect(dialog.locator("[data-picker-sheet]")).toBeHidden();
    await expect(dialog.locator("[data-marker-count]").first()).toBeVisible();
    await expect(dialog.locator("[data-picker-show-map]")).toHaveAttribute(
      "aria-checked",
      "true",
    );
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
    const listView = dialog.locator("[data-picker-sheet]");
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
