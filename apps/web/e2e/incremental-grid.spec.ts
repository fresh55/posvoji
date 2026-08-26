import { expect, test, type Page } from "@playwright/test";
import { cards } from "./grid";

// INITIAL_CARDS/CARDS_PER_STEP in animal-grid.tsx cap what mounts on first
// paint, so an unfiltered "Vse" tab draws 60 of the dataset's several hundred
// animals rather than all of them at once. The unit tests render the grid
// into jsdom, which has no IntersectionObserver worth calling one, so the
// sentinel actually growing the list on a real scroll is left for here.

function sentinel(page: Page) {
  return page.locator("[data-grid-sentinel]");
}

test("draws an initial page of cards and grows it as the sentinel is reached", async ({
  page,
}) => {
  await page.goto("/");

  const initial = await cards(page).count();
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThanOrEqual(60);
  await expect(sentinel(page)).toBeAttached();

  let previous = initial;
  for (let step = 0; step < 3; step += 1) {
    await sentinel(page).scrollIntoViewIfNeeded();
    await expect
      .poll(() => cards(page).count(), { timeout: 10_000 })
      .toBeGreaterThan(previous);
    previous = await cards(page).count();
  }

  // Real growth across the three steps, not just "changed once by one card":
  // CARDS_PER_STEP is 60, so three steps past the initial page should clear
  // it by a wide margin, well short of the ~500-animal dataset running out.
  expect(previous).toBeGreaterThan(initial + 100);
});
