import { expect, test, type Locator, type Page } from "@playwright/test";
import { pickerTrigger } from "./picker";

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

type CloseFrame = { y: number; top: number; sheet: boolean };

/** Presses a button in the open sheet and reads every frame for the next
 *  1.5s: the window's scroll, where the results begin, and whether the sheet
 *  is still in the document. */
function closeAndWatch(page: Page, label: RegExp): Promise<CloseFrame[]> {
  return page.evaluate(
    (source) =>
      new Promise<CloseFrame[]>((resolve) => {
        const results = document.querySelector(
          'section[aria-labelledby="rezultati"]',
        )!;
        const button = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '[data-slot="drawer-content"] button',
          ),
        ].find((b) =>
          new RegExp(source).test(
            (b.getAttribute("aria-label") ?? b.innerText).trim(),
          ),
        )!;
        const frames: CloseFrame[] = [];
        const started = performance.now();
        button.click();
        (function frame() {
          frames.push({
            y: Math.round(window.scrollY),
            top: Math.round(results.getBoundingClientRect().top + window.scrollY),
            sheet: document.querySelector('[data-slot="drawer-content"]') !== null,
          });
          if (performance.now() - started < 1500) requestAnimationFrame(frame);
          else resolve(frames);
        })();
      }),
    label.source,
  );
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

// The sidebar's half, with reload and history, is waiting-filter.spec.ts.
test("closes the sheet's sections with Čaka na dom and takes a threshold there", async ({
  page,
}) => {
  await page.goto("/");
  await filtriTrigger(page).click();
  const content = drawerContent(page);
  await expect(content).toBeVisible();

  const headings = content.getByRole("heading", { level: 3 });
  await expect(headings.last()).toHaveText(/^Čaka na dom/);
  await expect(headings.nth(-2)).toHaveText(/^Lahko ponudim/);

  const section = content.getByRole("button", { name: /^Čaka na dom/ });
  await expect(section).toHaveAttribute("aria-expanded", "false");
  await section.click();
  await expect(section).toHaveAttribute("aria-expanded", "true");

  // \s: the label ties the number to its unit with a no-break space.
  const year = content.getByRole("button", { name: /^Nad 1\sleto,/ });
  await expect(year).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/cakanje=/);
  await year.click();
  await expect(page).toHaveURL(/[?&]cakanje=nad-1-leto(&|$)/);
  await expect(year).toHaveAttribute("aria-pressed", "true");
  await expect(content).toBeVisible();
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

  // The tiles in a row stretch to the tallest one. While each tile centred its
  // own content, the tile whose label took two lines sat its hourglass 7.5px
  // above the other two.
  test("keeps a row's icons on one line when one tile's label wraps", async ({ page }) => {
    await page.goto("/");
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    await content.getByRole("button", { name: /^Čaka na dom/ }).click();

    const names = [/^Nad 6\smesecev,/, /^Nad 1\sleto,/, /^Nad 3\sleta,/];
    for (const name of names) {
      await expect(content.getByRole("button", { name })).toBeVisible();
    }
    const tiles = content.locator("button[aria-pressed]").filter({ hasText: /^Nad\s/ });

    // All three in one frame, and again until the section's reveal has
    // settled: WebKit was still moving the row on the first read.
    await expect(async () => {
      const measured = await tiles.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          // The mark is absolutely placed; the icon well is the first child
          // in the flow and the label the second.
          const [icon, label] = [...element.children].filter(
            (child) => getComputedStyle(child).position !== "absolute",
          );
          return {
            top: Math.round(box.top),
            icon: icon.getBoundingClientRect().top - box.top,
            lines: Math.round(
              label.getBoundingClientRect().height /
                parseFloat(getComputedStyle(label).lineHeight),
            ),
          };
        }),
      );

      // The premise: one row, and only the first label on two lines.
      expect(new Set(measured.map(({ top }) => top)).size).toBe(1);
      expect(measured.map(({ lines }) => lines)).toEqual([2, 1, 1]);
      for (const { icon } of measured.slice(1)) {
        expect(icon).toBeCloseTo(measured[0].icon, 0);
      }
    }).toPass({ timeout: 5_000 });
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

// Closing the sheet pops the history entry it opened on, and the browser used
// to put the page's scroll back where it was on that pop: a pick from 3000px
// down slid the sheet away over the old list, then jumped to the results once
// the sheet had gone (use-picker-history.ts, use-animal-filters.ts).
test.describe("the page under the closing sheet", () => {
  test("is on the results by the time the sheet has gone, and moves no more", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 2000));
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    await expect(content).toBeVisible();
    // Spol folds by default (use-filter-sections.ts), so it is opened first.
    await content.getByRole("button", { name: /^Spol/ }).click();
    await content.getByRole("button", { name: /^Samec,/ }).click();
    await expect(page).toHaveURL(/[?&]spol=samec(&|$)/);

    const frames = await closeAndWatch(page, /^Pokaži/);

    const bare = frames.filter((frame) => !frame.sheet);
    expect(bare.length).toBeGreaterThan(0);
    for (const frame of bare) expect(frame.y).toBe(frame.top);
  });

  test("stays where it was when the sheet closes with nothing picked", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 2000));
    const start = await page.evaluate(() => Math.round(window.scrollY));
    await filtriTrigger(page).click();
    await expect(drawerContent(page)).toBeVisible();

    const frames = await closeAndWatch(page, /^Zapri$/);

    const bare = frames.filter((frame) => !frame.sheet);
    expect(bare.length).toBeGreaterThan(0);
    for (const frame of bare) expect(frame.y).toBe(start);
  });
});

test.describe("the sheet under reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("appears and leaves without sliding, and hands the page back", async ({ page }) => {
    await page.goto("/");
    await filtriTrigger(page).click();
    const content = drawerContent(page);
    await expect(content).toBeVisible();
    // vaul slid it 608px on open and on close with the setting on.
    await expect(content).toHaveCSS("animation-name", "none");
    await expect(page.locator("[data-vaul-overlay]")).toHaveCSS(
      "animation-name",
      "none",
    );

    await content.getByRole("button", { name: "Zapri", exact: true }).click();

    await expect(content).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-scroll-locked",
      /.*/,
    );
    await expect(filtriTrigger(page)).toBeFocused();
  });
});

// The Kje row closes the sheet and opens the map it hands the press to. The
// map now opens before the sheet has finished leaving, so the sheet's own
// focus return, which comes when its content unmounts, must not take focus
// out of the map.
test("hands the Kje row over to the map with focus inside it", async ({ page }) => {
  await page.goto("/");
  await filtriTrigger(page).click();
  const content = drawerContent(page);
  await expect(content).toBeVisible();

  await content.getByRole("button", { name: /^Zavetišče:/ }).click();

  const picker = page.getByRole("dialog", { name: "Izberi zavetišča" });
  await expect(picker).toBeVisible();
  await expect(content).toHaveCount(0);
  await expect
    .poll(() => picker.evaluate((dialog) => dialog.contains(document.activeElement)))
    .toBe(true);
  expect(
    await page.evaluate(() => typeof history.state?.locationPicker),
  ).toBe("string");

  await page.keyboard.press("Escape");

  await expect(picker).toBeHidden();
  await expect(pickerTrigger(page)).toBeFocused();
});
