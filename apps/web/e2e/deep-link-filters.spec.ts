import { expect, test } from "@playwright/test";
import { cards } from "./grid";

// A static export has no server to read the query with, so a filtered link
// always opens onto the prerendered, unfiltered HTML first: the layout's
// inline script marks <html data-filtering> before anything paints, and
// app/globals.css hides the results block while that mark is on. AnimalGrid
// clears the mark in an effect after its first client render, the one that
// finally answers the address the link was actually opened at
// (prehydration-script.ts, animal-grid.tsx).
//
// Catching the pre-hydration flash itself is not practical from here -- it
// is gone within a frame or two of a real browser painting. What this pins
// is the settled state on the other side of it: the mark is gone, and the
// grid on screen is the filtered one, not the unfiltered one the prerendered
// HTML shipped with.
//
// velikost=majhna ("small", lib/filters.ts's FILTER_METADATA.size), not
// spol=samec: the dataset carries only a handful of small animals against
// several hundred overall, which keeps the filtered count well under
// INITIAL_CARDS (hooks/use-card-window.ts) so the comparison is a plain card count and
// not a race against which chunk happened to be drawn.

test("a filtered deep link settles on the filtered grid with the pre-hydration mark cleared", async ({
  page,
}) => {
  await page.goto("/");
  const total = await cards(page).count();
  expect(total).toBeGreaterThan(0);

  await page.goto("/?velikost=majhna");

  // Hydration has to run before the URL's filter takes effect over the
  // prerendered, unfiltered markup, so this polls for the settled count
  // rather than racing a single read against it.
  await expect
    .poll(() => cards(page).count(), { timeout: 10_000 })
    .toBeLessThan(total);

  const filtered = await cards(page).count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);

  const stillFiltering = await page.evaluate(() =>
    document.documentElement.hasAttribute("data-filtering"),
  );
  expect(stillFiltering).toBe(false);
});
