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

// The cat, held at the state he spends his whole life in wherever WebGL or
// the network never delivers him. Aborting the .glb is what makes that state
// the one under test: with it loading normally the viewer becomes a real
// image with a real name within a second or two on this machine, and the
// window in which the fault exists closes before a sweep can see it.
//
// The viewer is what has to be on the page, not the cat. model-viewer is
// appended as soon as its module lands and its stage is on screen, which is
// the moment the shadow root and its poster button exist, and nothing later
// about the model arriving changes the two facts being read here.
test("offers no unnamed tab stop on the about page while the cat is missing", async ({
  page,
}) => {
  await page.route("**/models/our-cat/cat.glb*", (route) => route.abort());
  await page.goto("/o-nas");
  const stage = page.locator('img[src*="/models/our-cat/poster.webp"]');
  await stage.scrollIntoViewIfNeeded();
  await expect(page.locator("model-viewer")).toBeAttached();

  expect(await hiddenFocusables(page)).toEqual([]);
});
