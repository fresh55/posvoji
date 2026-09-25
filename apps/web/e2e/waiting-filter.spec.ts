import { expect, test, type Locator, type Page } from "@playwright/test";

// Čaka na dom in the desktop sidebar: where it sits, what a pick writes, and
// what a reload and the back button make of it. The phone sheet's half is in
// filter-drawer-mobile.spec.ts, which the mobile projects run.
//
// spol=samec&skrb=potrpezljiv leaves chips from a group and from Lahko ponudim
// on the row before the pick, so "last" is measured against both, and still
// leaves animals behind every threshold, so no row is dead and hidden.
const START = "/?spol=samec&skrb=potrpezljiv";

function sidebar(page: Page): Locator {
  return page.locator("aside");
}

function waitingSection(page: Page): Locator {
  return sidebar(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^Čaka na dom/ }) });
}

function threshold(page: Page, name: RegExp): Locator {
  return waitingSection(page).getByRole("button", { name });
}

// \s and not a space: the labels tie the number to its unit with a no-break
// space (metadata.ts).
const OVER_1_YEAR = /^Nad 1\sleto,/;
const OVER_3_YEARS = /^Nad 3\sleta,/;

function chips(page: Page): Locator {
  return page.getByRole("button", { name: /^Odstrani filter / });
}

// The glass a pick comes to rest on (waiting-cards.tsx): the accent copy and
// its sand on, the muted sand off, the cut edges at the threshold's level and
// nothing turning or pouring. toHaveCSS polls, so this reads the settled
// drawing and not a frame of the pour.
async function expectGlassAtRest(
  row: Locator,
  value: string,
  edges: { top: string; bottom: string },
  picked: boolean,
) {
  const glass = row.locator(`svg[data-waiting-glyph="${value}"]`);
  await expect(glass.locator('[data-edge="top"]')).toHaveAttribute("y", edges.top);
  await expect(glass.locator('[data-edge="bottom"]')).toHaveAttribute("y", edges.bottom);
  await expect(glass.locator("[data-ink]")).toHaveCSS("opacity", picked ? "1" : "0");
  await expect(glass.locator('[data-sand="rest"]')).toHaveCSS("opacity", picked ? "0" : "0.45");
  await expect(glass.locator("[data-stream]")).toHaveCSS("opacity", "0");
  // The turn is the span two levels up from the drawing.
  await expect(glass.locator("xpath=../..")).toHaveCSS("transform", "none");
}

test("closes the sidebar's sections, takes one threshold at a time and chips it last", async ({ page }) => {
  await page.goto(START);
  const headings = sidebar(page).getByRole("heading", { level: 3 });
  await expect(headings.last()).toHaveText(/^Čaka na dom/);
  await expect(headings.nth(-2)).toHaveText(/^Lahko ponudim/);
  await expect(chips(page)).toHaveCount(2);

  await sidebar(page).getByRole("button", { name: /^Čaka na dom/ }).click();
  const year = threshold(page, OVER_1_YEAR);
  await expect(year).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/cakanje=/);

  await year.click();
  await expect(page).toHaveURL(/[?&]cakanje=nad-1-leto(&|$)/);
  await expect(year).toHaveAttribute("aria-pressed", "true");
  await expect(chips(page)).toHaveCount(3);
  await expect(chips(page).last()).toHaveAccessibleName(
    /^Odstrani filter Čaka nad 1\sleto$/,
  );

  // A second threshold replaces the first rather than joining it.
  const threeYears = threshold(page, OVER_3_YEARS);
  await threeYears.click();
  await expect(page).toHaveURL(/[?&]cakanje=nad-3-leta(&|$)/);
  await expect(page).not.toHaveURL(/nad-1-leto/);
  await expect(threeYears).toHaveAttribute("aria-pressed", "true");
  await expect(year).toHaveAttribute("aria-pressed", "false");
  await expect(chips(page)).toHaveCount(3);
  await expect(chips(page).last()).toHaveAccessibleName(
    /^Odstrani filter Čaka nad 3\sleta$/,
  );
});

test("a reload opens the section on the pick with its glass at rest", async ({ page }) => {
  await page.goto(START);
  await sidebar(page).getByRole("button", { name: /^Čaka na dom/ }).click();
  await threshold(page, OVER_1_YEAR).click();
  await expect(page).toHaveURL(/cakanje=nad-1-leto/);

  await page.reload();
  // Nobody opens it this time: an answered section opens itself.
  const year = threshold(page, OVER_1_YEAR);
  await expect(year).toHaveAttribute("aria-pressed", "true");
  await expectGlassAtRest(year, "over-1-year", { top: "7.2", bottom: "17.4" }, true);
  await expectGlassAtRest(
    threshold(page, OVER_3_YEARS),
    "over-3-years",
    { top: "9.4", bottom: "14.8" },
    false,
  );
  await expect(chips(page).last()).toHaveAccessibleName(
    /^Odstrani filter Čaka nad 1\sleto$/,
  );
});

// A pick replaces the entry it is on (writeFilters in use-animal-filters.ts),
// so the back button leaves the list for the page before it instead of
// stepping back through the ticks, and forward returns to the list as it was
// left, pick included.
test("back leaves the list rather than undoing the pick", async ({ page }) => {
  await page.goto("/viri");
  await page.goto(START);
  await sidebar(page).getByRole("button", { name: /^Čaka na dom/ }).click();
  await threshold(page, OVER_1_YEAR).click();
  await expect(page).toHaveURL(/cakanje=nad-1-leto/);

  await page.goBack();
  await expect(page).toHaveURL(/\/viri$/);

  await page.goForward();
  await expect(page).toHaveURL(/[?&]cakanje=nad-1-leto(&|$)/);
  await expect(threshold(page, OVER_1_YEAR)).toHaveAttribute("aria-pressed", "true");
});
