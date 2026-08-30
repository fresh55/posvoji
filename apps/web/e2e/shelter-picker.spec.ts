import { expect, test, type Locator } from "@playwright/test";
import { donePill, openPicker, pickerTrigger, rows } from "./picker";
import { MIN_TARGET, reachedBox } from "./reach";

// The panel's own flows, as opposed to shelter-map.spec.ts, which pins the map
// beside it. The unit tests render this panel into jsdom, which reports every
// element as zero-sized: it can assert that a class is present and that state
// moved, and it cannot answer any question whose answer is a measurement.
// Four such questions are left, and they are what this file pins.
//
//   the scroll fade   only engages when the content is genuinely taller than
//                     the box, which needs real heights
//   the touch targets only clear 44px if nothing clips or overlaps them, which
//                     needs a real hit test rather than a computed style
//   the fold          has to survive a close and reopen, which needs the whole
//                     dialog lifecycle rather than a remount
//   the footer pill   counts what the filter actually matches, end to end from
//                     a row click through the URL to the button's own label
//
// Selectors stay on roles and data-* attributes, the contract these components
// keep. Class names are not used to find anything.

// The one scroller in the panel. It is found by the utility that makes it one,
// because the fade is the thing under test and the class is its contract.
function list(dialog: Locator): Locator {
  return dialog.locator("[data-picker-panel] .fade-scroll");
}

// Links inside the scroller only. The caption under the map carries the CC BY
// attribution, which is links the dialog holds and this file is never asking
// about.
function offRows(dialog: Locator): Locator {
  return list(dialog).getByRole("link");
}

function offGroupTrigger(dialog: Locator): Locator {
  return dialog.getByRole("button", {
    name: /Trenutno brez objavljenih živali/,
  });
}

// The off-roster group itself, named by whichever shape its heading is drawn
// in: a fold trigger while there is something to fold, a plain paragraph when
// the group holds the only match. ShelterRows carries role="group" and
// aria-labelledby pointing at that heading, so this is the same element in
// both states and it asserts the tie between the heading and the rows under
// it rather than the presence of a sentence.
//
// Not getByText on the heading's own words. The map draws the same sentence
// in a marker's callout for a shelter with nothing listed, so filtering down
// to one such shelter and letting the pointer land on its row puts that copy
// on screen twice and the text locator resolves to two elements. That is what
// it did: strict mode violation, intermittently, depending on where the mouse
// came to rest after the list relaid out.
function offGroup(dialog: Locator): Locator {
  return dialog.getByRole("group", {
    name: /Trenutno brez objavljenih živali/,
  });
}

test.describe("desktop", () => {
  test("names itself for a screen reader", async ({ page }) => {
    await page.goto("/");
    const trigger = pickerTrigger(page);

    // The one place the trigger's role and its label are asserted. Everything
    // else in this directory reaches the dialog through data-picker-trigger,
    // so a change here fails this test and only this test, saying which
    // attribute moved instead of reddening every spec at once.
    //
    // A button and not a combobox: aria-haspopup="dialog" is what the press
    // actually does, and a combobox would promise a value and a listbox to
    // pick it from that this control does not own.
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAccessibleName(/^Zavetišče:/);
    expect(await trigger.evaluate((el) => el.tagName.toLowerCase())).toBe(
      "button",
    );

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("fades the list's clipped edge, and only the clipped one", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const scroller = list(dialog);
    await expect(scroller).toBeVisible();

    // The registry holds more shelters than the panel is tall, so there is
    // always something below the fold to say so.
    const overflows = await scroller.evaluate(
      (el) => el.scrollHeight > el.clientHeight + 8,
    );
    expect(overflows).toBe(true);

    // Read the inline values the hook writes rather than the computed ones:
    // the two custom properties are registered and transitioned, so a computed
    // read lands mid-ease and says nothing about where it is heading.
    const atTop = await scroller.evaluate((el) => ({
      top: el.style.getPropertyValue("--scroll-fade-top"),
      bottom: el.style.getPropertyValue("--scroll-fade-bottom"),
    }));
    expect(atTop).toEqual({ top: "0", bottom: "1" });

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    // The listener is passive and fires on the next frame, not on assignment.
    await expect
      .poll(() =>
        scroller.evaluate((el) =>
          el.style.getPropertyValue("--scroll-fade-top"),
        ),
      )
      .toBe("1");
    expect(
      await scroller.evaluate((el) =>
        el.style.getPropertyValue("--scroll-fade-bottom"),
      ),
    ).toBe("0");

    // And the fade replaces the scrollbar rather than sitting beside one.
    // Typed to HTMLElement because evaluate hands back the SVGElement union
    // and only the HTML branch carries offsetWidth.
    const gutter = await scroller.evaluate(
      (el: HTMLElement) => el.offsetWidth - el.clientWidth,
    );
    expect(gutter).toBe(0);
  });

  test("folds the empty-shelter group shut, and opens it on a press", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    const trigger = offGroupTrigger(dialog);

    // The heading counts what it is holding shut, so the group answers for
    // itself before anyone opens it.
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveText(/\(\d+\)/);
    await expect(offRows(dialog)).toHaveCount(0);

    await trigger.click();

    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Rows out rather than dead toggles: there is a page for each of them.
    expect(await offRows(dialog).count()).toBeGreaterThan(0);

    // And the rows are named by the heading that explains them, not left as a
    // run of links a screen reader hears with no context.
    const labelled = dialog.locator('[role="group"][aria-labelledby]');
    await expect(labelled).toHaveCount(1);
    const labelId = await labelled.getAttribute("aria-labelledby");
    await expect(dialog.locator(`#${labelId}`)).toHaveText(
      /Trenutno brez objavljenih živali/,
    );
  });

  test("forgets the fold when the dialog closes", async ({ page }) => {
    const dialog = await openPicker(page);
    await offGroupTrigger(dialog).click();
    await expect(offGroupTrigger(dialog)).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await pickerTrigger(page).click();
    await expect(dialog).toBeVisible();

    // The search and the open shelter are both dropped on close; the fold is
    // the same kind of state and goes with them. A reopened picker holding one
    // visit's fold while dropping that visit's search remembers half a session.
    await expect(offGroupTrigger(dialog)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("counts what the filter matches on the way out", async ({ page }) => {
    const dialog = await openPicker(page);
    const pill = donePill(page);

    const before = await pill.textContent();
    expect(before).toMatch(/^Pokaži \d+ živali?$/);

    // Picking one shelter narrows the filter, so the number behind the button
    // has to come down with it. Filtering is live, so this is not a promise
    // about the press: it is what is already behind the map.
    await rows(dialog).first().click();
    await expect(
      dialog.getByRole("button", { name: /Počisti izbor/ }),
    ).toBeVisible();

    await expect.poll(() => pill.textContent()).not.toBe(before);
    expect(await pill.textContent()).toMatch(/^Pokaži \d+ živali?$/);

    await pill.click();
    await expect(dialog).toBeHidden();
  });

  test("opens the group unfolded when it holds the only match", async ({
    page,
  }) => {
    const dialog = await openPicker(page);
    // One box for a place and for a shelter's name alike. A name the postal
    // table does not know is a name being searched for, which is what this
    // test types.
    const search = dialog.getByLabel(/Kraj, pošta ali zavetišče/);

    // A name only the off-roster group carries, read off the group itself
    // rather than hard-coded, so the registry can change under this test
    // without breaking it. The whole name and not a word from it: every third
    // shelter in the country is called "Zavetišče something", so a single word
    // is as likely to match the live list as the group being aimed at.
    await offGroupTrigger(dialog).click();
    // The row's own name, past the aria-hidden spacer that stands in for the
    // check glyph so the two lists share their columns: the label is the first
    // span that is not that spacer, and the city rides in a sibling under it.
    const offName = (
      await offRows(dialog)
        .first()
        .locator("span:not([aria-hidden]) > span")
        .first()
        .textContent()
    )?.trim();
    expect(offName).toBeTruthy();
    await page.keyboard.press("Escape");
    await pickerTrigger(page).click();

    await search.fill(offName!);

    // No live rows left, so the group is not a group, it is the answer: drawn
    // open with a plain heading and no control that could hide it.
    await expect(rows(dialog)).toHaveCount(0);
    expect(await offRows(dialog).count()).toBeGreaterThan(0);
    await expect(offGroupTrigger(dialog)).toHaveCount(0);
    await expect(offGroup(dialog)).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("gives every control in a row a real 44px target", async ({ page }) => {
    const dialog = await openPicker(page);
    const row = rows(dialog).first();
    await expect(row).toBeVisible();

    // Hit-tested, not measured; see reach.ts for why a computed height and a
    // class assertion both pass on a target something else is drawn over.
    const reached = await reachedBox(row);

    expect(reached.height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(reached.top).toBe(true);
    expect(reached.centre).toBe(true);
    expect(reached.bottom).toBe(true);
  });

  test("keeps the fold's own trigger thumb-sized", async ({ page }) => {
    const dialog = await openPicker(page);
    const trigger = offGroupTrigger(dialog);
    await trigger.scrollIntoViewIfNeeded();

    const reached = await reachedBox(trigger);

    // 36px, and deliberately not MIN_TARGET: this row sits between two others
    // and a full 44 on all three would push the header taller than the sheet
    // budgets for. It still clears WCAG 2.5.8.
    expect(reached.height).toBeGreaterThanOrEqual(36);
    expect(reached.centre).toBe(true);
  });
});
