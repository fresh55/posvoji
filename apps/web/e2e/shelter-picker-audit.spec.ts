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
    await page.getByRole("button", { name: /^V bližini Ljubljana/ }).click();
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

test("Back retains a shelter selected on the map and unrelated URL parameters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?campaign=hello%20world");
  await pickerTrigger(page).click();
  const region = page.getByRole("button", {
    name: /^Pomurska:/,
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

test("a touch arm has a visible outline and an explicit selection action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await pickerTrigger(page).click();
  await page.locator("[data-picker-show-map]").click();
  const region = page.getByRole("button", { name: /^Pomurska:/ });
  await region.tap();
  await expect(region).toHaveAttribute("data-region-armed", "true");
  await expect(region).toHaveAttribute("stroke-dasharray", "3 2");
  const select = page.locator("[data-map-action]");
  await expect(select).toHaveAccessibleName(/^Izberi.*Pomurska/);
  await expect(select).toBeVisible();
  await select.tap();
  await expect(page).toHaveURL(/zavetisce=mala-hisa/);
});
