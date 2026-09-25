import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { touch } from "./touch";

// Ponastavi in a folding section's heading (filter-section-header.tsx). It was
// centred with a translate that the shared Button's press translate replaced,
// so while it was held it dropped by half its height and a pixel: 13px under a
// mouse and 23px under a finger's 44px box. A press at or above its middle was
// let go over the fold trigger below it, where under a mouse nothing happened
// and under a finger the section folded with its filter still on. jsdom lays
// nothing out and presses nothing, so both are measured here.
//
// /?spol=samec opens Spol with an answer in it on both surfaces, which is what
// draws the link.
const START = "/?spol=samec";
const RESET = "Ponastavi filter spola";

// Where on the link's own box the press lands, from its top edge down.
const PRESS_POINTS = [0.15, 0.35, 0.5, 0.65, 0.85];

function sexSection(panel: Locator): Locator {
  return panel
    .locator("section")
    .filter({ has: panel.page().getByRole("heading", { name: /^Spol/ }) });
}

/** The link's box once it has stopped moving: the phone sheet slides up, and
 *  a press aimed at a box read mid-slide lands somewhere else. */
async function settledBox(target: Locator) {
  let last = await target.boundingBox();
  await expect(async () => {
    await target.page().waitForTimeout(100);
    const next = await target.boundingBox();
    const moved = !last || !next || Math.abs(last.y - next.y) > 0.5;
    last = next;
    expect(moved).toBe(false);
  }).toPass();
  if (!last) throw new Error("the reset link has no box");
  return last;
}

async function expectResetAndStillOpen(page: Page, panel: Locator) {
  await expect(page).not.toHaveURL(/[?&]spol=/);
  await expect(
    sexSection(panel).getByRole("button", { name: /^Spol/ }),
  ).toHaveAttribute("aria-expanded", "true");
}

test("resets Spol from a mouse press anywhere on its Ponastavi", async ({
  page,
}) => {
  const sidebar = page.locator("aside");
  for (const at of PRESS_POINTS) {
    await page.goto(START);
    // By role, so it is found only once the answer has arrived and the link
    // is no longer inert and hidden.
    const reset = sexSection(sidebar).getByRole("button", { name: RESET });
    await expect(reset).toBeVisible();
    const box = await settledBox(reset);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height * at);
    await page.mouse.down();
    await page.mouse.up();

    await expectResetAndStillOpen(page, sidebar);
  }
});

test.describe("on a phone", () => {
  // A phone context inside the desktop project, the way grid.visual.spec.ts
  // builds one: isMobile and hasTouch are what turn pointer: coarse on, and
  // with it the link's 44px box, which is the one a finger dropped 23px.
  const pixel = devices["Pixel 7"] as (typeof devices)[string];
  test.use({
    userAgent: pixel.userAgent,
    viewport: pixel.viewport,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });
  // The touch points go over a CDP session, which only Chromium speaks.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the touch points are dispatched over a CDP session, which is Chromium only",
  );

  test("resets Spol from a tap at the middle of its Ponastavi and leaves it open", async ({
    page,
  }) => {
    await page.goto(START);
    await page.getByRole("button", { name: /^Filtri/ }).tap();
    const sheet = page.locator('[data-slot="drawer-content"]');
    await expect(sheet).toBeVisible();
    const reset = sexSection(sheet).getByRole("button", { name: RESET });
    await expect(reset).toBeVisible();
    const box = await settledBox(reset);

    // A finger held for 80ms, long enough for the press state to be drawn
    // under it before it lifts.
    const cdp = await page.context().newCDPSession(page);
    const point = {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      id: 1,
    };
    await touch(cdp, "touchStart", [point]);
    await page.waitForTimeout(80);
    await touch(cdp, "touchEnd", []);

    await expectResetAndStillOpen(page, sheet);
  });
});
