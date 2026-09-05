import { expect, test, type Page } from "@playwright/test";
import { dialog } from "./fan";
import { cards } from "./grid";
import { touch } from "./touch";

// The way to the next animal on a device with a finger.
//
// The dialog has always carried two steps at the edges of the box and the same
// two on PageUp and PageDown. Both start at sm: below it the arrows are not
// drawn and a phone has no page keys, so the only way to the animal after this
// one was to close the dialog and find the next card. The title row carries the
// pair below sm instead.
//
// A real mobile context and not a narrow desktop window, because what is asked
// here is what a thumb gets: the tap has to arrive as a tap, and the dialog's
// own dismiss gesture is listening on the same pointer.

function title(page: Page) {
  return dialog(page).locator('[data-slot="dialog-title"]');
}

function phoneNav(page: Page, direction: "previous" | "next") {
  return dialog(page).locator(
    `[data-slot="animal-nav-phone"][data-direction="${direction}"]`,
  );
}

// The pair the wider layout draws at the edges of the box. Both pairs answer to
// the same two labels, so this one is asked for by not being the other.
function edgeNav(page: Page, label: string) {
  return dialog(page).locator(
    `button[aria-label="${label}"]:not([data-slot="animal-nav-phone"])`,
  );
}

// The dialog opened from a card rather than from ?zival=: what it steps through
// is the list on screen, and a tap on a card is how a phone gets there.
//
// The address carries a filter on purpose. The index is prerendered with a real
// href on every card and the dialog belongs to hydration, so a tap that lands
// before React has attached follows the link to the animal's own page instead
// of opening anything. The pre-hydration mark on <html> is the one signal that
// the grid has had its first client render: the blocking script sets it for an
// address carrying a filter param and AnimalGrid clears it in an effect
// (lib/prehydration-script.ts, animal-grid.tsx), which is the same settled
// state deep-link-filters.spec.ts waits for.
async function openFirstCard(page: Page) {
  await page.goto("/?vrsta=pes");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute("data-filtering"),
      ),
    )
    .toBe(false);

  const names = (await cards(page).locator("h3").allTextContents()).map((name) =>
    name.trim(),
  );
  expect(names.length).toBeGreaterThan(1);

  await cards(page).first().locator("h3").tap();
  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toHaveText(names[0]);
  return names;
}

test("steps to the next animal from the title row", async ({ page }) => {
  const names = await openFirstCard(page);

  // The list opens on its first animal, so there is nothing before it and no
  // dead control standing in for that.
  await expect(phoneNav(page, "previous")).toHaveCount(0);
  const next = phoneNav(page, "next");
  await expect(next).toBeVisible();

  await next.tap();

  // The dialog is still open, on the animal after the one it opened on: the
  // body's drag-to-close is listening on the same pointer, and a tap on a
  // control is a tap.
  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toHaveText(names[1]);
  // And the step back appears, because there is now something behind.
  await expect(phoneNav(page, "previous")).toBeVisible();

  await phoneNav(page, "previous").tap();

  await expect(title(page)).toHaveText(names[0]);
});

test("leaves the edge arrows to the wider layout", async ({ page }) => {
  await openFirstCard(page);

  // Rendered and not drawn, which is the same thing the sm-only close button
  // on the title row does: one markup, two layouts.
  const edge = edgeNav(page, "Naslednja žival");
  await expect(edge).toHaveCount(1);
  await expect(edge).toBeHidden();
  await expect(phoneNav(page, "next")).toBeVisible();
});

// The longest name in the register, by a wide margin: a shelter's listing
// title typed into a name field. It is what the title row has to survive, so
// it is named here rather than looked for, and a dataset that has stopped
// carrying it should fail in one obvious place.
const LONGEST_NAME_ID = "mala-hisa:psi_za_oddajo:rolf-nemski-ovcar-8-let";
const LONGEST_NAME = "Rolf, nemški ovčar, 8 let";

test("keeps the title row's controls together on the narrowest phone", async ({
  page,
}) => {
  // 375px is the narrowest screen the site is built for, and the row is
  // flex-wrap: the name and the badge are allowed to take the line and leave
  // the controls the next one. What may not happen is the controls themselves
  // splitting across two lines, or the row reaching past the card.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?zival=${encodeURIComponent(LONGEST_NAME_ID)}`);

  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toHaveText(LONGEST_NAME);
  const next = phoneNav(page, "next");
  await expect(next).toBeVisible();

  const row = await next.evaluate((button) => {
    const group = button.parentElement as HTMLElement;
    const line = group.parentElement as HTMLElement;
    // offsetParent is null for the display:none close button the wider layout
    // keeps in this same group, so what is measured is what is on screen.
    const drawn = (Array.from(group.children) as HTMLElement[]).filter(
      (child) => child.offsetParent !== null,
    );
    const heading = line.querySelector('[data-slot="dialog-title"]');
    return {
      controls: drawn.length,
      groupHeight: group.getBoundingClientRect().height,
      tallestControl: Math.max(
        ...drawn.map((child) => child.getBoundingClientRect().height),
      ),
      groupRight: group.getBoundingClientRect().right,
      lineRight: line.getBoundingClientRect().right,
      headingRight: heading!.getBoundingClientRect().right,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

  // The two steps and the share button, and the group of them is one control
  // tall: the name and the badge may take the line above, the controls may not
  // break among themselves.
  expect(row.controls).toBeGreaterThanOrEqual(3);
  expect(row.groupHeight).toBeLessThanOrEqual(row.tallestControl + 1);
  // Inside the row, which is inside the card: a name this long wraps rather
  // than pushing anything out of the dialog.
  expect(row.groupRight).toBeLessThanOrEqual(row.lineRight + 0.5);
  expect(row.headingRight).toBeLessThanOrEqual(row.lineRight + 0.5);
  expect(row.scrollWidth).toBe(row.innerWidth);
});

// The same step, delivered as touch points rather than as a tap Playwright
// performs: no actionability wait, no scroll into view, and a pointerdown that
// bubbles to the dialog body's dismiss gesture on its way through. What is
// asked here is that a thumb landing where the button stands steps the animal
// and leaves the dialog open, which is the pair of handlers listening on the
// one finger.
test.describe("under real touch points", () => {
  // Dispatched over a CDP session, which only Chromium speaks.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the touch points are dispatched over a CDP session, which is Chromium only",
  );

  test("steps the animal on a tap the browser delivers", async ({ page }) => {
    const names = await openFirstCard(page);
    const next = phoneNav(page, "next");
    await expect(next).toBeVisible();

    // Hit-tested rather than aimed: a point the button does not answer for is
    // a tap on whatever is standing over it, and the tap would pass either
    // way. The same check the fan's own touch targets get.
    const point = await next.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + box.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, onButton: hit !== null && button.contains(hit) };
    });
    expect(point.onButton).toBe(true);

    const cdp = await page.context().newCDPSession(page);
    // Down and up with nothing in between, which is the whole of a tap.
    await touch(cdp, "touchStart", [{ x: point.x, y: point.y, id: 1 }]);
    await touch(cdp, "touchEnd", []);

    await expect(title(page)).toHaveText(names[1]);
    // Its open state and not its visibility: a dialog on its way out is
    // visible for the length of its exit animation.
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
  });
});
