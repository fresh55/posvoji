import { expect, test, type Locator, type Page } from "@playwright/test";

// The drawer this file exercises is FilterSheet's, opened from the "Filtri"
// button in the mobile dock (animal-filters.tsx). It is the only Drawer this
// app mounts, so a data-slot locator never has to be scoped against a second
// instance the way the two LocationPicker mounts do (see picker.ts).

function filtriTrigger(page: Page): Locator {
  return page.getByRole("button", { name: /^Filtri/ });
}

function drawerContent(page: Page): Locator {
  return page.locator('[data-slot="drawer-content"]');
}

test("opening the Filtri drawer moves focus inside its content", async ({
  page,
}) => {
  await page.goto("/");
  await filtriTrigger(page).click();

  const content = drawerContent(page);
  await expect(content).toBeVisible();

  // Vaul defaults autoFocus to false, which cancels Radix's own mount focus
  // and leaves focus behind on the trigger, behind an aria-hidden region,
  // with Tab walking straight past the drawer into the rest of the page. The
  // Drawer wrapper in ui/drawer.tsx turns autoFocus back on so Radix's
  // FocusScope actually traps Tab inside the content; this is the regression
  // that pins the mount focus really landing there rather than on the
  // trigger it came from.
  const inside = await content.evaluate((el) =>
    el.contains(document.activeElement),
  );
  expect(inside).toBe(true);
});

test.describe("breakpoint survival", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("closes the drawer when the viewport crosses into desktop", async ({
    page,
  }) => {
    await page.goto("/");
    await filtriTrigger(page).click();

    const content = drawerContent(page);
    await expect(content).toBeVisible();

    // Vaul portals the drawer straight to <body>, so nothing about the
    // drawer itself reacts to a resize on its own. useDesktopBreakpointClose
    // is what watches the same 64rem breakpoint the Filtri trigger vanishes
    // at (it is lg:hidden) and closes a controlled drawer the moment the
    // viewport crosses it -- a phone rotated to landscape past 1024px, or,
    // as here, a window resize past it.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(content).toBeHidden();
  });
});

test.describe("approved mobile filter regressions", () => {
  test.use({ viewport: { width: 320, height: 740 } });

  test("keeps Undo visible and usable in the open sheet", async ({ page }) => {
    await page.goto("/?velikost=majhna");
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    await page.clock.install();
    await content.getByRole("button", { name: "Počisti filtre" }).click();

    const undo = content.getByRole("button", {
      name: "Razveljavi čiščenje filtrov",
    });
    await expect(undo).toBeInViewport();
    await undo.focus();
    await page.clock.fastForward(8_000);
    await expect(undo).toBeEnabled();
    await expect(undo).toBeFocused();

    // Closing starts the page's window. Reopening pauses that existing offer
    // too, instead of letting its old deadline disable the footer button.
    await content.getByRole("button", { name: "Zapri", exact: true }).click();
    await expect(content).toBeHidden();
    await page.clock.fastForward(2_000);
    await expect(page.locator('[data-slot="mobile-filter-row"]').getByRole("button", {
      name: "Razveljavi čiščenje filtrov",
    })).toBeVisible();
    await filtriTrigger(page).click();
    await expect(content).toBeVisible();
    await expect(undo).toBeEnabled();
    await undo.focus();
    await page.clock.fastForward(8_000);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page).toHaveURL(/velikost=majhna/);
    await expect(content).toBeVisible();
  });

  test("opens the section selected by a filtered link and keeps manual folding available", async ({ page }) => {
    await page.goto("/?velikost=majhna");
    await page.evaluate(() => localStorage.setItem("posvoji:filter-sections", JSON.stringify({ size: false })));
    await page.reload();
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    const size = content.getByRole("button", { name: /^Velikost/ });
    await expect(size).toHaveAttribute("aria-expanded", "true");
    await expect(content.getByRole("button", { name: /^Majhna, / })).toBeVisible();
    await size.click();
    await expect(size).toHaveAttribute("aria-expanded", "false");
    await expect(size).toContainText("Majhna");
  });

  test("offers sorting in exactly one placement across the phone and tablet boundaries", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 767, height: 513 },
      { width: 768, height: 513 },
      { width: 768, height: 512 },
      { width: 844, height: 390 },
      { width: 820, height: 1180 },
      { width: 1024, height: 512 },
      { width: 1180, height: 820 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const sheetSort = viewport.width < 768 || viewport.height <= 512;
      if (viewport.width < 1024) {
        const toolbarSort = page.locator('[data-slot="mobile-toolbar"] [role="combobox"]');
        await expect(toolbarSort).toBeVisible({ visible: !sheetSort });
        await filtriTrigger(page).click();
        await expect(drawerContent(page).locator('[role="combobox"]')).toBeVisible({ visible: sheetSort });
        await drawerContent(page).getByRole("button", { name: "Zapri", exact: true }).click();
        await expect(drawerContent(page)).toBeHidden();
      } else {
        await expect(filtriTrigger(page)).toBeHidden();
        await expect(page.getByRole("combobox")).toHaveCount(1);
        await expect(page.getByRole("combobox")).toBeVisible();
      }
    }
  });

  test("wraps active filters in flow without a second horizontal scroller", async ({ page }) => {
    await page.goto("/?spol=samec&starost=odrasel&velikost=majhna&cakanje=nad-1-leto");
    const row = page.locator('[data-slot="mobile-filter-row"]');
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: /^Odstrani filter/ })).toHaveCount(4);
    const layout = await row.evaluate((element) => {
      const stops = [...element.querySelectorAll<HTMLElement>("[data-chip-stop]")];
      const bounds = element.getBoundingClientRect();
      return {
        position: getComputedStyle(element).position,
        markedStrips: element.querySelectorAll("[data-scroll-strip]").length,
        overflow: element.scrollWidth > element.clientWidth,
        wraps: new Set(stops.map((stop) => Math.round(stop.getBoundingClientRect().top))).size > 1,
        fits: stops.every((stop) => stop.getBoundingClientRect().right <= bounds.right),
      };
    });
    expect(layout).toEqual({ position: "static", markedStrips: 0, overflow: false, wraps: true, fits: true });
    await row.getByRole("button", { name: "Odstrani filter Samec" }).click();
    await expect(page).not.toHaveURL(/spol=/);
  });

  test("folds secondary sections and describes the shelter chooser accurately", async ({ page }) => {
    await page.goto("/");
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    const size = content.getByRole("button", { name: /^Velikost/ });
    await expect(size).toHaveAttribute("aria-expanded", "false");
    await size.click();
    await expect(size).toHaveAttribute("aria-expanded", "true");
    const scope = content.locator('[data-slot="location-scope-row"]');
    await expect(scope.getByRole("button", { name: /^Zavetišče:/ })).toHaveAccessibleName(/Izberi zavetišča/);
    await expect(scope.getByText("Izberi", { exact: true })).toBeVisible();
  });

  test("keeps sorting reachable after the landscape toolbar scrolls away", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 900));
    const toolbar = page.locator('[data-slot="mobile-toolbar"]');
    await expect(toolbar).not.toBeInViewport();
    await filtriTrigger(page).click();
    const sort = drawerContent(page).getByRole("combobox");
    await expect(sort).toBeInViewport();
    await sort.click();
    await page.getByRole("option", { name: "Ime A–Ž" }).click();
    await expect(sort).toContainText("Ime A–Ž");
  });
});
