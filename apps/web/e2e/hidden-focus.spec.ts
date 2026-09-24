import { expect, test } from "@playwright/test";

import { KLOPKA, openFan } from "./fan";
import { hiddenFocusables } from "./reach";

// Nothing on this site may be a tab stop and be missing from the
// accessibility tree at the same time. WCAG 4.1.2, swept rather than
// reviewed.
//
// It is swept because the site keeps writing the pair by hand. Six places
// carry aria-hidden next to their own tabIndex={-1}, two attributes that have
// to agree with nothing holding them together, and the seventh was the about
// page's cat: <model-viewer> is appended into a host that carried aria-hidden
// alone, and the focusable poster button in its shadow root made a real stop
// that announced nothing, between the contact address and Srecko's link. The
// dead stop was permanent wherever the .glb never arrived.
//
// reach.ts carries how the two facts are read. What this file decides is
// where to read them: a route each for the three page shapes the site has,
// plus the dialog, which is where most of the hand-written pairs live.

const ROUTES = [
  { name: "the index", path: "/" },
  { name: "the register", path: "/zavetisca" },
  { name: "a shelter", path: "/zavetisca/johanca" },
  { name: "the found-animal page", path: "/najdena-zival" },
];

for (const route of ROUTES) {
  test(`offers no unnamed tab stop on ${route.name}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("main")).toBeVisible();

    expect(await hiddenFocusables(page)).toEqual([]);
  });
}

// The dialog, opened on an animal with a gallery: the photo surface, the two
// chevrons and the dots are all aria-hidden on purpose and all have to stay
// out of the tab order to be allowed it.
test("offers no unnamed tab stop in the animal dialog", async ({ page }) => {
  await openFan(page, KLOPKA);

  expect(await hiddenFocusables(page)).toEqual([]);
});

// The cat in both states short of loaded. While the .glb is on its way,
// <model-viewer> sits in a host that stays aria-hidden until he is ready, and
// its shadow root holds focusable parts of its own. Holding the request open
// keeps him there for the first sweep; with it answered, the viewer either
// becomes a named image or is gone within a few frames, before a sweep can
// see it.
//
// Once the request fails, the stage removes the viewer and waits for a reach
// to retry under a fresh URL, because model-viewer caches a failed load. The
// second sweep reads the failed stage as it is left.
test("offers no unnamed tab stop on the about page while the cat is missing", async ({
  page,
}) => {
  let fail = () => {};
  const failed = new Promise<void>((resolve) => {
    fail = resolve;
  });
  await page.route("**/models/our-cat/cat.glb*", async (route) => {
    await failed;
    await route.abort();
  });
  await page.goto("/o-nas");
  const stage = page.locator('img[src*="/models/our-cat/poster.webp"]');
  await stage.scrollIntoViewIfNeeded();
  const viewer = page.locator("model-viewer");
  await expect(viewer).toBeAttached();

  expect(await hiddenFocusables(page)).toEqual([]);

  fail();
  await expect(viewer).not.toBeAttached();

  expect(await hiddenFocusables(page)).toEqual([]);
});
