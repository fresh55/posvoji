import { expect, test, type Locator, type Page } from "@playwright/test";

// The unit tests render the picker to static markup and read its data-*
// attributes, which covers the state contract. Three things are left over that
// only a real browser can answer: whether a pointer over a marker reaches the
// matching list row, whether the foreignObject tooltip card is drawn where a
// pointer can raise it, and whether the desktop dialog lays out without
// scrolling as a whole. That is what this file pins.
//
// Selectors stay on roles and data-* attributes, which are the contract the map
// components keep. Class names are not used to find anything.

// Both the desktop bar and the mobile dock render a picker trigger, and one of
// the two is display:none at any given width.
function pickerTrigger(page: Page): Locator {
  return page
    .getByRole("combobox", { name: /^Zavetišče:/ })
    .filter({ visible: true });
}

// The shelter rows are buttons with aria-pressed, and so is the sort toggle
// that sits above them. Only a row wraps its label in spans.
const ROW = "button[aria-pressed]:has(span)";

function rows(dialog: Locator): Locator {
  return dialog.locator(ROW);
}

function markers(dialog: Locator): Locator {
  return dialog.locator("g[data-marker-key]");
}

// Regions the map treats as live carry role=button. Empty ones are aria-hidden
// paths with no role.
function liveRegions(dialog: Locator): Locator {
  return dialog.locator('path[role="button"]');
}

// One card serves markers and regions alike.
function callout(dialog: Locator): Locator {
  return dialog.locator("foreignObject");
}

async function openPicker(page: Page): Promise<Locator> {
  await page.goto("/");
  await pickerTrigger(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('svg[role="group"]')).toBeVisible();
  return dialog;
}

// A region is not a rectangle, so the centre of its bounding box is often
// outside the shape or under a marker. Ask the geometry for a point that is
// inside the fill and is the topmost element there, in viewport coordinates.
async function pointOnRegion(
  region: Locator,
): Promise<{ x: number; y: number }> {
  const point = await region.evaluate((element) => {
    const shape = element as unknown as SVGGeometryElement;
    const box = shape.getBBox();
    const matrix = shape.getScreenCTM();
    if (!matrix) return null;
    const steps = 16;
    for (let row = 1; row < steps; row += 1) {
      for (let column = 1; column < steps; column += 1) {
        const local = new DOMPoint(
          box.x + (box.width * column) / steps,
          box.y + (box.height * row) / steps,
        );
        if (!shape.isPointInFill(local)) continue;
        const screen = local.matrixTransform(matrix);
        if (document.elementFromPoint(screen.x, screen.y) !== shape) continue;
        return { x: screen.x, y: screen.y };
      }
    }
    return null;
  });
  expect(point, "found no reachable point inside the region").not.toBeNull();
  return point as { x: number; y: number };
}

// Away from every marker, row and region, without leaving the page.
async function movePointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lays the dialog out without scrolling it as a whole", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const map = dialog.locator('svg[role="group"]');
    const firstRow = rows(dialog).first();
    await expect(firstRow).toBeVisible();

    // The map keeps its height and the list scrolls in its own pane, so the
    // dialog has nothing left to scroll.
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(2);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const target of [map, firstRow]) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
    }
  });

  test("a hovered marker tints its rows and raises its card", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const marker = markers(dialog).first();
    await expect(marker).toBeVisible();
    await marker.hover();

    const tinted = dialog.locator("button[aria-pressed][data-highlighted]");
    await expect(tinted.first()).toBeVisible();
    await expect(callout(dialog)).toHaveCount(1);

    // The card names the town for a cluster and the shelter for a single
    // marker. Either name is text the tinted row carries too, so the two can be
    // checked against each other without hardcoding a shelter.
    const title = (await callout(dialog).locator("span").first().textContent())
      ?.trim();
    expect(title).toBeTruthy();
    expect(await tinted.first().textContent()).toContain(title);

    await movePointerAway(page);
    await expect(tinted).toHaveCount(0);
    await expect(callout(dialog)).toHaveCount(0);
  });

  test("a hovered row lights its marker and its region", async ({ page }) => {
    const dialog = await openPicker(page);
    // A row with no animals and no selection is disabled, and a disabled
    // button never reports a hover.
    const row = dialog.locator(`${ROW}:not([disabled])`).first();
    await row.hover();

    await expect(dialog.locator("g[data-marker-highlighted]")).toHaveCount(1);
    await expect(dialog.locator("path[data-region-highlighted]")).toHaveCount(
      1,
    );

    await movePointerAway(page);
    await expect(dialog.locator("g[data-marker-highlighted]")).toHaveCount(0);
    await expect(dialog.locator("path[data-region-highlighted]")).toHaveCount(
      0,
    );
  });

  test("a hovered region raises its own card", async ({ page }) => {
    const dialog = await openPicker(page);
    const region = liveRegions(dialog).first();
    const label = (await region.getAttribute("aria-label")) ?? "";
    const name = label.split(":")[0];
    expect(name).toBeTruthy();

    const point = await pointOnRegion(region);
    await page.mouse.move(point.x, point.y);

    await expect(callout(dialog)).toHaveCount(1);
    await expect(callout(dialog)).toContainText(name);

    await movePointerAway(page);
    await expect(callout(dialog)).toHaveCount(0);
  });

  test("clicking a region selects every shelter in it", async ({ page }) => {
    const dialog = await openPicker(page);
    const region = liveRegions(dialog).first();
    const label = (await region.getAttribute("aria-label")) ?? "";
    // "Savinjska: 3 zavetišča, 250 živali". The first number is the shelter
    // count, and how many rows the click has to press.
    const shelters = Number(label.match(/\d+/)?.[0]);
    expect(shelters).toBeGreaterThan(0);

    const pressed = dialog.locator('button[aria-pressed="true"]:has(span)');
    await expect(pressed).toHaveCount(0);

    const point = await pointOnRegion(region);
    await page.mouse.click(point.x, point.y);

    await expect(region).toHaveAttribute("aria-pressed", "true");
    await expect(region).toHaveAttribute("data-region-state", "selected");
    await expect(pressed).toHaveCount(shelters);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hides the marker layer and keeps the dialog in the viewport", async ({
    page,
  }) => {
    const dialog = await openPicker(page);

    // Markers are a pointer refinement for md and up. Below it the regions and
    // the list are the whole interface.
    await expect(markers(dialog).first()).toBeHidden();
    await expect(liveRegions(dialog).first()).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
