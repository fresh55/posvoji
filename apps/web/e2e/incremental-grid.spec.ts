import { expect, test, type Page } from "@playwright/test";
import { cards } from "./grid";

// INITIAL_CARDS in animal-grid.tsx caps what mounts on first paint, so an
// unfiltered "Vse" tab draws 60 of the dataset's several hundred animals
// rather than all of them at once. Each automatic step after it is
// ROWS_PER_STEP rows wide and the budget runs out at TARGET_ROWS, both
// measured off the columns the viewport actually draws, so how many steps
// happen here is a property of the browser window and not something this test
// can name. What it can pin is the shape either way: the sentinel grows the
// grid on a real scroll, and when the budget is spent it gives way to the
// button and the count line. The unit tests render into jsdom, which has no
// IntersectionObserver worth calling one, so that is left for here.

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

  // Scroll the sentinel into view until it is gone, which is the budget
  // running out. The cap is a runaway guard and not an expected step count:
  // the widest viewport spends the budget in two steps, and reaching it means
  // the sentinel never settled at all.
  let steps = 0;
  while ((await sentinel(page).count()) > 0) {
    expect(steps).toBeLessThan(8);
    const before = await cards(page).count();
    await sentinel(page).scrollIntoViewIfNeeded();
    await expect
      .poll(() => cards(page).count(), { timeout: 10_000 })
      .toBeGreaterThan(before);
    steps += 1;
  }

  // Real growth, not "changed once by one card": the narrowest budget on the
  // narrowest grid is 40 rows of two columns, so 80 cards, which is a third
  // again the initial page and well short of the ~500-animal dataset running
  // out.
  const drawn = await cards(page).count();
  expect(steps).toBeGreaterThan(0);
  expect(drawn).toBeGreaterThanOrEqual(80);

  // Settled, and the settled state says so: the way on is a control the
  // visitor presses, with the count of what is drawn under it, so the footer
  // stands one press below the grid rather than behind an endless one.
  await expect(page.getByRole("button", { name: /Prikaži še/ })).toBeVisible();
  await expect(
    page.getByText(new RegExp(`^${drawn} od \\d+ živali$`)),
  ).toBeVisible();
});
