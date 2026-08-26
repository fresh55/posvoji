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
