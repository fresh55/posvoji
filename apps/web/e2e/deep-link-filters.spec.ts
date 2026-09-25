import { expect, test } from "@playwright/test";
import { cards } from "./grid";

// A static export has no server to read the query with, so a filtered link
// always opens onto the prerendered, unfiltered HTML first: the layout's
// inline script marks <html data-filtering> before anything paints, and
// app/globals.css hides the results block while that mark is on. AnimalGrid
// clears the mark in an effect once the cards it draws are the filtered ones
// (prehydration-script.ts, animal-grid.tsx).
//
// The first test pins the settled state: the mark is gone, and the grid on
// screen is the filtered one, not the unfiltered one the prerendered HTML
// shipped with. The second pins the moment the mark comes off.
//
// velikost=majhna ("small", lib/filters.ts's FILTER_METADATA.size), not
// spol=samec: the dataset carries only a handful of small animals against
// several hundred overall, which keeps the filtered count well under
// INITIAL_CARDS (animal-grid.tsx) so the comparison is a plain card count and
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

// On Psi a card's fact line leaves the species out, because the tab has said
// it, and on Vse it opens with it (animalMetaParts in lib/labels.ts), so the
// lines say which list the cards are.
const SPECIES_FIRST = /^(Pes|Mačka|Zajček|Druga žival)\b/;

// Hydration draws from the server's empty query, the address is read in the
// render after it, and the cards follow a render behind that (animal-grid.tsx).
// A mark taken off at the first client render let the unfiltered cards paint
// under a pressed Psi tab, for about half a second in WebKit. The observer below is registered before
// any of the page's scripts and reads the cards in the task that took the mark
// off, which is before the browser paints again.
test("takes the mark off only once the cards are the filtered ones", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-filtering")) return;
      observer.disconnect();
      (window as unknown as { atRelease: string[] }).atRelease = Array.from(
        document.querySelectorAll(
          '[data-slot="results"] article [data-slot="card-link"] p',
        ),
        (line) => line.textContent?.trim() ?? "",
      );
    });
    // The document and not <html>, which does not exist yet when this runs.
    observer.observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-filtering"],
    });
  });

  await page.goto("/?vrsta=pes");
  await page.waitForFunction(() => "atRelease" in window);
  const lines = await page.evaluate(
    () => (window as unknown as { atRelease: string[] }).atRelease,
  );

  expect(lines.length).toBeGreaterThan(0);
  expect(lines.filter((line) => SPECIES_FIRST.test(line))).toEqual([]);
});

// /?najdena used to open the homepage map dialog on its found-animal tab.
// Municipality websites published that address and cannot be asked to change
// it, so the homepage still answers it: the tab is gone and the lookup is a
// page, and the link lands on the page. A static export has no server to
// redirect with, so this happens on hydration and is polled for.
test("sends an old /?najdena link on to the found-animal page", async ({
  page,
}) => {
  await page.goto("/?najdena");

  await expect(page).toHaveURL(/\/najdena-zival$/);
  // The page itself, not just its address: the finder's own field is what the
  // link was opened for.
  await expect(
    page.getByRole("combobox", { name: "Občina ali poštna številka", exact: true }),
  ).toBeVisible();
});
