import { expect, test, type Page } from "@playwright/test";
import { dialog } from "./fan";
import { cards } from "./grid";
import { touch } from "./touch";

// The way to the next animal on a device with a finger.
//
// The dialog has always carried two steps at the edges of the box and the same
// two on PageUp and PageDown. Both start at sm: below it the arrows are not
// drawn and a phone has no page keys, so the only way to the animal after this
// one was to close the dialog and find the next card. The phone gets the pair
// as two links at the end of the card, each naming the animal it leads to.
// They used to be round chevrons on the title row, under the fan's
// "Foto 1 / 13", and were pressed for the next photo.
//
// A real mobile context and not a narrow desktop window, because what is asked
// here is what a thumb gets: the tap has to arrive as a tap, and the dialog's
// own dismiss gesture is listening on the same pointer.

function title(page: Page) {
  return dialog(page).locator('[data-slot="dialog-title"]');
}

function stepLink(page: Page, direction: "previous" | "next") {
  return dialog(page).locator(
    `a[data-slot="animal-step"][data-direction="${direction}"]`,
  );
}

// The pair the wider layout draws at the edges of the box.
function edgeNav(page: Page, label: string) {
  return dialog(page).locator(`button[aria-label="${label}"]`);
}

// The phone scrolls the whole shell, which is the dialog's own box.
function shellScroll(page: Page) {
  return dialog(page).evaluate((box) => box.scrollTop);
}

// The dialog opened from a card rather than from ?zival=: what it steps through
// is the list on screen, and a tap on a card is how a phone gets there.
//
// The address carries a filter on purpose. The index is prerendered with a real
// href on every card and the dialog belongs to hydration, so a tap that lands
// before React has attached follows the link to the animal's own page instead
// of opening anything. The pre-hydration mark on <html> is the one signal that
// the grid has hydrated and drawn the dogs the address asks for: the blocking
// script sets it for an address carrying a filter param and AnimalGrid clears
// it in an effect once the cards are the filtered ones
// (lib/prehydration-script.ts, animal-grid.tsx), which is the same settled
// state deep-link-filters.spec.ts waits for. That spec also pins the order:
// the mark used to come off a render before the cards were filtered, and the
// names read here were then the unfiltered page's.
//
// Polled every 50ms rather than on the default back-off, which can have
// reached a second by the time the mark comes off. A tap that late can land
// after the dialog has mounted on its idle timer (animal-grid.tsx; WebKit has
// no requestIdleCallback), and the card then opens it through a view
// transition, which crashes Playwright's WebKit on Windows.
async function openFirstCard(page: Page) {
  await page.goto("/?vrsta=pes");
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.documentElement.hasAttribute("data-filtering"),
        ),
      { intervals: [50] },
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

test("steps to the next animal from the end of the card", async ({ page }) => {
  const names = await openFirstCard(page);

  // The list opens on its first animal, so there is nothing before it and no
  // dead control standing in for that.
  await expect(stepLink(page, "previous")).toHaveCount(0);
  const next = stepLink(page, "next");
  await expect(next).toBeVisible();
  // It says where it goes before it is pressed.
  await expect(next).toHaveAccessibleName(`Naslednja žival: ${names[1]}`);
  await expect(next).toContainText(names[1]);

  // Playwright scrolls it into view first, which is the reading of the whole
  // card this step comes at the end of.
  await next.tap();

  // The dialog is still open, on the animal after the one it opened on: the
  // body's drag-to-close is listening on the same pointer, and a tap on a
  // control is a tap.
  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toHaveText(names[1]);
  // At its top, not at the bottom where the last one was left.
  await expect.poll(() => shellScroll(page)).toBe(0);
  // And the step back appears, because there is now something behind.
  await expect(stepLink(page, "previous")).toBeVisible();

  await stepLink(page, "previous").tap();

  await expect(title(page)).toHaveText(names[0]);
});

test("leaves the edge arrows to the wider layout", async ({ page }) => {
  await openFirstCard(page);

  // Rendered and not drawn, which is the same thing the sm-only close button
  // on the title row does: one markup, two layouts.
  const edge = edgeNav(page, "Naslednja žival");
  await expect(edge).toHaveCount(1);
  await expect(edge).toBeHidden();
  await expect(stepLink(page, "next")).toBeVisible();
});

// The longest name in the register: "brezrepa tritačka Luna" at Mačja hiša,
// which writes a descriptor in front of the name across its listings. 22
// characters where the median name has five. It is what the title row has to
// survive, so it is named here rather than looked for. At 360px it once pushed
// the three round controls beside it to a second line (the title row's comment
// in animal-dialog.tsx); the share button is the row's one control now, and
// the name has the rest of the line. When the dataset stops carrying this
// animal the dialog never opens, and the message on the first assertion below
// names the id rather than failing as a bare visibility timeout.
const BREZREPA_LUNA = "macja-hisa:4872";
const BREZREPA_LUNA_NAME = "brezrepa tritačka Luna";

test("gives the longest name the title row beside the share button", async ({
  page,
}) => {
  // 375px is the narrowest screen the site is built for, and the row is
  // flex-wrap: the name is what gives way. What may not happen is the share
  // button leaving the name's line, the name being cut short, or the row
  // reaching past the card.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/?zival=${encodeURIComponent(BREZREPA_LUNA)}`);

  await expect(
    dialog(page),
    `the dialog did not open for ${BREZREPA_LUNA}, which may have left data/dist/animals.json`,
  ).toBeVisible();
  await expect(title(page)).toHaveText(BREZREPA_LUNA_NAME);
  const share = dialog(page).getByRole("button", { name: "Deli" });
  await expect(share).toBeVisible();

  const row = await share.evaluate((button) => {
    const group = button.parentElement as HTMLElement;
    const line = group.parentElement as HTMLElement;
    // offsetParent is null for the display:none close button the wider layout
    // keeps in this same group, so what is counted is what is on screen.
    const drawn = (Array.from(group.children) as HTMLElement[]).filter(
      (child) => child.offsetParent !== null,
    );
    const heading = line.querySelector<HTMLElement>('[data-slot="dialog-title"]')!;
    const headingBox = heading.getBoundingClientRect();
    return {
      controls: drawn.length,
      groupTop: group.getBoundingClientRect().top,
      groupRight: group.getBoundingClientRect().right,
      lineRight: line.getBoundingClientRect().right,
      headingBottom: headingBox.bottom,
      headingRight: headingBox.right,
      headingClipped: heading.scrollHeight > heading.clientHeight + 1,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

  // The share button alone: no chevron beside the name for a thumb to read as
  // the next photo.
  expect(row.controls).toBe(1);
  // On the name's own line rather than below it.
  expect(row.groupTop).toBeLessThan(row.headingBottom);
  // The whole name, not two lines of it and an ellipsis.
  expect(row.headingClipped).toBe(false);
  // Inside the row, which is inside the card.
  expect(row.groupRight).toBeLessThanOrEqual(row.lineRight + 0.5);
  expect(row.headingRight).toBeLessThanOrEqual(row.lineRight + 0.5);
  expect(row.scrollWidth).toBe(row.innerWidth);
});

// The same step, delivered as touch points rather than as a tap Playwright
// performs: no actionability wait, no scroll into view, and a pointerdown that
// bubbles to the dialog body's dismiss gesture on its way through. What is
// asked here is that a thumb landing where the link stands steps the animal
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
    const next = stepLink(page, "next");
    await expect(next).toBeVisible();

    // The end of the card is where a reader arrives by scrolling; the sticky
    // bar below it must not be what the finger lands on.
    await next.scrollIntoViewIfNeeded();
    await next.click({ trial: true });

    // Hit-tested rather than aimed: a point the link does not answer for is a
    // tap on whatever is standing over it, and the tap would pass either way.
    // The same check the fan's own touch targets get.
    const point = await next.evaluate((link) => {
      const box = link.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + box.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, onLink: hit !== null && link.contains(hit) };
    });
    expect(point.onLink).toBe(true);

    const cdp = await page.context().newCDPSession(page);
    // Down and up with nothing in between, which is the whole of a tap.
    await touch(cdp, "touchStart", [{ x: point.x, y: point.y, id: 1 }]);
    await touch(cdp, "touchEnd", []);

    await expect(title(page)).toHaveText(names[1]);
    // Its open state and not its visibility: a dialog on its way out is
    // visible for the length of its exit animation.
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
    await expect.poll(() => shellScroll(page)).toBe(0);
  });
});
