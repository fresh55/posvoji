import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PortalAnimal, PortalListing } from "../lib/portal-api";

const ID = "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10";
const OPTIONAL = {
  sex: null, breed: null, birthDate: null, approximateAgeMonths: null,
  size: null, energy: null, goodWithKids: null, goodWithDogs: null,
  goodWithCats: null, apartmentOk: null, specialNeeds: null, shortDescription: null,
};
const LISTING: PortalListing = {
  providerId: "johanca", id: ID, species: "cat", status: "available", name: "Luna",
  ...OPTIONAL, photos: [], createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z", archivedAt: null,
};
const ANIMAL: PortalAnimal = {
  id: "testno:1", species: "cat", status: "available", name: "Muri",
  ...OPTIONAL, thumbnailUrl: null, overrides: {},
};
// A valid one-pixel fixture, held in memory rather than a new image asset.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);

async function mockPortal(page: Page, manual = true, empty = false, storedCount = 0) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": request.headers().origin ?? "http://localhost:3210",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, X-CSRFToken",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    let json: unknown;
    let status = 200;
    if (path === "/api/me") {
      json = {
        email: "shelter@example.test",
        shelters: [{
          slug: manual ? "johanca" : "testno",
          name: "Zavetišče Testno", city: "Kranj", ingestion: manual ? "manual" : "scrape",
        }],
      };
    } else if (path === "/api/auth/csrf") {
      json = { csrfToken: "fixture-csrf-token" };
    } else if (path === "/api/auth/logout") {
      json = {};
    } else if (request.method() !== "GET") {
      // Upload failures expose the retry/remove row; failed form saves grow
      // the bottom bar so its footer clearance is tested at its taller size.
      status = 500;
      json = { detail: "Fixture save failure" };
    } else if (path.endsWith("/listings")) {
      json = empty ? [] : [{ ...LISTING, photos: Array.from({ length: storedCount }, (_, index) => ({
        id: index + 1, url: `data:image/png;base64,${PIXEL.toString("base64")}`, width: 1, height: 1,
      })) }];
    } else if (path.endsWith("/animals")) {
      json = [ANIMAL];
    } else {
      throw new Error(`Unexpected portal request: ${request.method()} ${path}`);
    }
    await route.fulfill({ status, headers, json });
  });
}

async function newDraft(page: Page) {
  await mockPortal(page, true, true);
  await page.goto("/portal");
  await page.getByRole("link", { name: "Dodaj žival", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Ime", exact: true });
  // An actual click supplies the user activation native leave prompts need.
  await name.click();
  await name.fill("Fixture draft");
  await page.getByLabel("Dodaj fotografijo").setInputFiles({
    name: "pending.png", mimeType: "image/png", buffer: PIXEL,
  });
  await expect(page.locator("figure img")).toHaveCount(1);
}

async function expectHitTarget(target: Locator) {
  // A visible control may still be under the fixed save bar. Center it in
  // the scrollable page before testing what an unobstructed tap reaches.
  await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(target).toBeInViewport();
  await expect.poll(() => target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return element.contains(hit);
  })).toBe(true);
}

test.use({ viewport: { width: 320, height: 740 } });

test("keeps queued photos through Back, Forward and the resume action", async ({ page }) => {
  await newDraft(page);
  const preview = await page.locator("figure img").getAttribute("src");
  await page.goBack();
  await expect(page.getByRole("link", { name: "Nadaljuj dodajanje živali" })).toBeVisible();
  await page.goForward();
  await expect(page.locator("figure img")).toHaveAttribute("src", preview!);
  await page.goBack();
  await page.getByRole("link", { name: "Nadaljuj dodajanje živali" }).click();
  await expect(page.getByRole("textbox", { name: "Ime", exact: true })).toHaveValue("Fixture draft");
  await expect(page.locator("figure img")).toHaveAttribute("src", preview!);
  expect(await page.locator("figure img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1);
});

test("warns before reload or the brand link leaves pending photos behind", async ({ page }) => {
  await newDraft(page);
  const address = page.url();
  for (const action of ["reload", "brand"] as const) {
    const prompt = page.waitForEvent("dialog", { timeout: 10_000 });
    const leaving = action === "reload"
      ? page.reload({ timeout: 10_000 }).catch(() => null)
      : page.getByRole("link", { name: "posvoji.si, Portal za zavetišča" }).click();
    const dialog = await prompt;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    await leaving;
    await expect(page).toHaveURL(address);
    await expect(page.locator("figure img")).toHaveCount(1);
  }
});

test("keeps every failed upload's Remove button reachable at 320px", async ({ page }) => {
  await mockPortal(page);
  await page.goto(`/portal/zival?zavetisce=johanca&id=${ID}`);
  const names = ["a-very-long-fixture-photo-name-without-spaces.png", "second-fixture.png"];
  await page.getByLabel("Dodaj fotografijo").setInputFiles(names.map((name) => ({
    name, mimeType: "image/png", buffer: PIXEL,
  })));
  await expect(page.getByRole("button", { name: "Naloži znova", exact: true })).toHaveCount(2);
  const figures = page.locator("figure");
  for (let index = 0; index < 2; index++) {
    const retry = figures.nth(index).getByRole("button", { name: "Naloži znova", exact: true });
    await expectHitTarget(retry);
    const remove = figures.nth(index).getByRole("button", { name: "Odstrani", exact: true });
    await expectHitTarget(remove);
    const bounds = await remove.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(await remove.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
    expect(await remove.evaluate((element) => getComputedStyle(element).touchAction)).toBe("manipulation");
  }
  await figures.first().getByRole("button", { name: "Odstrani", exact: true }).click();
  await expect(figures).toHaveCount(1);
  await expect(figures.first()).toContainText(names[1]);
});

test("keeps stored photos in three columns with layout-sized touch targets", async ({ page }) => {
  await mockPortal(page, true, false, 5);
  await page.goto(`/portal/zival?zavetisce=johanca&id=${ID}`);
  const photos = page.locator("figure img");
  await expect(photos).toHaveCount(5);
  const rows = await photos.evaluateAll((images) => images.map((image) => {
    const rect = image.getBoundingClientRect();
    return { top: rect.top, width: rect.width };
  }));
  expect(rows[0].top).toBe(rows[1].top);
  expect(rows[1].top).toBe(rows[2].top);
  expect(rows[3].top).toBeGreaterThan(rows[2].top);
  expect(rows[3].top).toBe(rows[4].top);
  const remove = page.getByRole("button", { name: "Odstrani 1. fotografijo", exact: true });
  await expectHitTarget(remove);
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await remove.evaluate((element) => getComputedStyle(element).touchAction)).toBe("manipulation");
});

test("names queued photos on discard and keeps them until sign-out is confirmed", async ({ page }) => {
  await newDraft(page);
  await page.getByRole("link", { name: "Vaše živali", exact: true }).tap();
  let confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("fotografije, ki še niso naložene");
  await confirmation.getByRole("button", { name: "Nadaljuj urejanje", exact: true }).tap();
  await page.goBack();
  const signOut = page.getByRole("button", { name: "Odjava", exact: true });
  await signOut.tap();
  confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("neshranjeni popravki in nenaložene fotografije");
  await confirmation.getByRole("button", { name: "Ostani v portalu", exact: true }).tap();
  await expect(signOut).toBeFocused();
  await page.getByRole("link", { name: "Nadaljuj dodajanje živali", exact: true }).tap();
  await expect(page.locator("figure img")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Ime", exact: true })).toHaveValue("Fixture draft");
  await page.getByRole("button", { name: "Odjava", exact: true }).tap();
  await page.getByRole("alertdialog").getByRole("button", { name: "Zavrzi in odjavi", exact: true }).tap();
  await expect(page).toHaveURL(/\/portal\/prijava\/?$/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith("posvoji.portal.draft:")))).toBe(false);
});

for (const manual of [true, false]) {
  test(`keeps the footer above the ${manual ? "listing" : "animal"} editor save bar and its error`, async ({ page }) => {
    await mockPortal(page, manual);
    await page.goto(manual
      ? `/portal/zival?zavetisce=johanca&id=${ID}`
      : "/portal/zival?zavetisce=testno&id=testno%3A1");
    const name = page.getByRole("textbox", { name: "Ime", exact: true });
    await expect(name).toBeVisible();
    const repo = page.locator('footer a[href*="github.com/"]');
    for (const failed of [false, true]) {
      if (failed) {
        await name.fill("Changed fixture name");
        await page.locator("[data-save-bar]").getByRole("button", { name: "Shrani", exact: true }).click();
        await expect(page.locator("[data-save-bar]")).toContainText("Shranjevanje ni uspelo");
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectHitTarget(repo);
      const link = await repo.boundingBox();
      const bar = await page.locator("[data-save-bar]").boundingBox();
      expect(link!.y + link!.height).toBeLessThanOrEqual(bar!.y);
    }
  });
}
