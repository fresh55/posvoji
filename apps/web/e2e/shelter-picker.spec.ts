import { expect, test, type Locator } from "@playwright/test";
import { donePill, openPicker, pickerTrigger, rows } from "./picker";
import { isReachable, MIN_TARGET, reachedBox } from "./reach";

// Browser checks complement unit coverage with actual clipping, scrolling,
// hit targets, dialog lifecycle, and result counts from the current dataset.
// Stable data attributes identify the list independently of its styling.
function list(dialog: Locator): Locator {
  return dialog.locator("[data-picker-list-scroll]");
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

  test("does one job, and offers no found-animal tab", async ({ page }) => {
    const dialog = await openPicker(page);

    // This dialog used to carry a tab row, "Zavetišča" beside "Najdena žival",
    // and answer both questions from one panel. The lookup is a page now
    // (/najdena-zival), so there is no tab row and no lone tab standing where
    // the row was.
    await expect(dialog.locator("[data-picker-tab]")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Najdena žival" }),
    ).toHaveCount(0);
    // The way out of the panel is unconditional again: the tab that hid it is
    // gone with the row.
    await expect(donePill(page)).toBeVisible();
  });

  test("keeps selected names and the result action usable with the desktop list folded", async ({ page }) => {
    const dialog = await openPicker(page);
    await rows(dialog).first().click();
    const footer = dialog.locator("[data-picker-footer]");
    const chip = footer.getByRole("button", { name: /^Odstrani zavetišče:/ });
    await expect(chip).toHaveCount(1);
    const selectedName = await chip.getAttribute("title");
    expect(selectedName).toBeTruthy();
    await expect(pickerTrigger(page)).toHaveAccessibleName(`Zavetišče: ${selectedName}. Odpri zemljevid.`);
    await dialog.getByRole("button", { name: "Skrij seznam", exact: true }).click();
    await expect(dialog.locator("[data-picker-panel]")).toHaveAttribute("data-picker-panel", "collapsed");
    expect(await isReachable(donePill(page))).toBe(true);
    expect(await isReachable(chip)).toBe(true);

    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(pickerTrigger(page)).toHaveAccessibleName("Zavetišče: Vsa zavetišča. Odpri zemljevid.");
    await donePill(page).click();
    await expect(dialog).toBeHidden();
  });

  test("offers city matching and nearby sorting as separate choices", async ({ page }) => {
    const dialog = await openPicker(page);
    const search = dialog.getByLabel("Kraj, pošta ali zavetišče");
    await search.fill("Ljubljana");
    const suggestion = dialog.getByRole("button", { name: /^V bližini Ljubljana/ });
    await expect(suggestion).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Odstrani izhodišče" })).toHaveCount(0);
    const matches = rows(dialog);
    expect(await matches.count()).toBeGreaterThan(0);
    for (const row of await matches.all()) await expect(row).toContainText(/Ljubljana/i);
    const before = await pickerTrigger(page).getAttribute("aria-label");
    await search.press("Enter");
    await expect(suggestion).toBeFocused();
    await expect(pickerTrigger(page)).toHaveAttribute("aria-label", before!);

    await suggestion.click();
    await expect(dialog.getByRole("button", { name: "Odstrani izhodišče" })).toBeVisible();
    await expect(search).toHaveValue("Ljubljana");
    expect(await matches.count()).toBeGreaterThan(1);
    await expect(dialog.getByText("Približna zračna razdalja med kraji.")).toBeVisible();
    await search.fill("");
    await expect(dialog.getByRole("button", { name: "Odstrani izhodišče" })).toBeVisible();
    await dialog.getByRole("button", { name: "Odstrani izhodišče" }).click();
    await expect(dialog.getByRole("button", { name: "Odstrani izhodišče" })).toHaveCount(0);
  });

  test("lets shelter content scroll without obscuring its text", async ({ page }) => {
    const dialog = await openPicker(page);
    const scroller = list(dialog);
    await expect(scroller).toBeVisible();
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 8)).toBe(true);
    expect(await scroller.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");

    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await scroller.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");
    expect(await isReachable(donePill(page))).toBe(true);
    await expect(dialog.getByRole("heading", { name: "Izberi zavetišča" })).toBeVisible();
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

  test("keeps named selection and results usable after switching to the map", async ({ page }) => {
    const dialog = await openPicker(page);
    await rows(dialog).first().click();
    await dialog.locator("[data-picker-show-map]").click();
    await expect(dialog.locator("[data-picker-sheet]")).toHaveAttribute("data-picker-sheet", "collapsed");
    const chip = dialog.locator("[data-picker-footer]").getByRole("button", { name: /^Odstrani zavetišče:/ });
    await expect(chip).toHaveCount(1);
    expect(await isReachable(chip)).toBe(true);
    expect(await isReachable(donePill(page))).toBe(true);
    await donePill(page).click();
    await expect(dialog).toBeHidden();
  });

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

    expect(reached.height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(reached.centre).toBe(true);
  });
});
