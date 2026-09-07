import { test, expect } from "@playwright/test";
import { pickerTrigger, donePill } from "./picker";

test.use({ hasTouch: true });
for (const width of [375, 640, 800]) {
  test(`search and wait metadata remain readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await pickerTrigger(page).click();
    const search = page.getByLabel("Kraj, pošta ali zavetišče");
    await expect(search).toHaveCSS("font-size", "16px");
    await search.fill("1000");
    const waits = page.locator("[data-row-wait]");
    expect(await waits.count()).toBeGreaterThan(0);
    for (const wait of await waits.all()) {
      expect(
        await wait.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await expect(page.getByRole("dialog")).toBeVisible();
    await donePill(page).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
}

test("zero-match regions stay selectable and Back retains the live filter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?vrsta=zajcek&campaign=hello%20world");
  await pickerTrigger(page).click();
  const region = page.getByRole("button", {
    name: /^Pomurska:.*0 živali s temi filtri/,
  });
  await region.focus();
  await region.press("Enter");
  await expect(page).toHaveURL(/zavetisce=mala-hisa/);
  await expect(
    page.locator('[data-shelter-row="mala-hisa"] button[aria-pressed]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/zavetisce=mala-hisa/);
  await expect(page).toHaveURL(/campaign=hello%20world/);
});

test("a touch arm has a visible outline and tells the visitor to tap again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await pickerTrigger(page).click();
  const region = page.getByRole("button", { name: /^Pomurska:/ });
  await region.tap();
  await expect(region).toHaveAttribute("data-region-armed", "true");
  await expect(region).toHaveAttribute("stroke-dasharray", "3 2");
  await expect(page.getByText(/Še enkrat tapni:/)).toBeVisible();
  await region.tap();
  await expect(page).toHaveURL(/zavetisce=mala-hisa/);
});
