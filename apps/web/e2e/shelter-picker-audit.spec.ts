import { test, expect } from "@playwright/test";
import { pickerTrigger, donePill } from "./picker";

test.use({ hasTouch: true });
for (const width of [375, 640, 800]) {
  test(`search and the distance line remain readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await pickerTrigger(page).click();
    const search = page.getByLabel("Kraj, pošta ali zavetišče");
    await expect(search).toHaveCSS("font-size", "16px");
    await search.fill("1000");
    await page.getByRole("button", { name: /^V bližini Ljubljana/ }).click();
    // The distance under each name once a place is chosen: whole, on one
    // line and inside the row, however the town beside it wraps.
    const distances = page.locator("[data-row-km]");
    expect(await distances.count()).toBeGreaterThan(0);
    for (const distance of await distances.all()) {
      await expect(distance).toContainText("km");
      // One line tall, whatever number of fragments the engine reports.
      expect(
        await distance.evaluate(
          (el) =>
            el.getBoundingClientRect().height <
            1.5 * parseFloat(getComputedStyle(el).lineHeight),
        ),
      ).toBe(true);
      expect(
        await distance.evaluate((el) => {
          const row = el.closest("[data-shelter-row]")!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return box.left >= row.left && box.right <= row.right;
        }),
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
