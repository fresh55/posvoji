import { expect, type Locator, type Page } from "@playwright/test";

// The selector contract both picker specs are written against, in one place.
//
// These four are not conveniences. Each one encodes a fact about the markup in
// location-picker.tsx and shelter-rows.tsx: that the trigger's role is a plain
// button, that a row is the thing with aria-pressed and a span inside it while
// the distance chips above the list are not, and that an open picker is a dialog
// with the map's own group inside it. Copied into each spec, they went out of
// step the first time one of those facts moved — the trigger's role changed
// with an aria-haspopup and the whole suite went red for a reason that read
// like a product bug.
//
// Not a .spec.ts, so Playwright's default testMatch leaves it alone.
//
// Only the shared ones live here. Each spec keeps the helpers it is the sole
// caller of: the map's markers and callouts, the panel's list, its off-roster
// rows and its footer.

// Both the desktop bar and the mobile dock render a picker trigger, and one of
// the two is display:none at any given width.
//
// Located by data-picker-trigger, not by role and label. The trigger's implicit
// role is derived from its aria-haspopup, and when that changed to "dialog" the
// role stopped being combobox and every spec in this directory went red at
// once — seven failures for one attribute, none of them naming it. The role and
// the Slovenian label are still worth pinning, but in one explicit test that
// fails on its own; see "names itself for a screen reader" in
// shelter-picker.spec.ts.
export function pickerTrigger(page: Page): Locator {
  return page.locator("[data-picker-trigger]").filter({ visible: true });
}

// Shelter rows carry their own marker; selection and view controls elsewhere
// in the dialog must never be mistaken for an animal-filter choice.
export const ROW = "[data-shelter-row] button[aria-pressed]";

export function rows(dialog: Locator): Locator {
  return dialog.locator(ROW);
}

/** A live region on the plate, by name. The ones that carry a click to commit
 *  are the ones with a commit key, which is the same attribute the arming
 *  reads, and the label is what a screen reader is told they are.
 *
 *  Named rather than taken by index, because index order is the order
 *  lib/region-shapes.ts lists them in and that puts Pomurska first, in the
 *  top-right corner of the plate under the dialog's own close button.
 *  Osrednjeslovenska and Savinjska sit in the middle of the country, clear of
 *  the title chip on one corner and the close on the other, and both hold
 *  shelters in every dataset the suites run against: Ljubljana and Celje. */
export function region(dialog: Locator, name: string): Locator {
  return dialog.locator(
    `[data-map-commit^="region:"][aria-label^="${name}"]`,
  );
}

export async function openPicker(page: Page): Promise<Locator> {
  await page.goto("/");
  await pickerTrigger(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Izberi zavetišča" })).toBeVisible();
  return dialog;
}

// The persistent footer carries either the result count or the zero-result
// return action. Scoping it keeps unrelated map/list controls out.
export function donePill(page: Page): Locator {
  return page.locator("[data-picker-footer]").getByRole("button", {
    name: /^(Pokaži .* živali?|Nazaj k rezultatom)$/,
  });
}
