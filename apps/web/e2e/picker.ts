import { expect, type Locator, type Page } from "@playwright/test";

// The selector contract both picker specs are written against, in one place.
//
// These four are not conveniences. Each one encodes a fact about the markup in
// location-picker.tsx and shelter-rows.tsx: that the trigger's role is a plain
// button, that a row is the thing with aria-pressed and a span inside it while
// the sort toggle above the list is not, and that an open picker is a dialog
// with the map's own group inside it. Copied into each spec, they went out of
// step the first time one of those facts moved — the trigger's role changed
// with an aria-haspopup and the whole suite went red for a reason that read
// like a product bug.
//
// Not a .spec.ts, so Playwright's default testMatch leaves it alone.
//
// Only the shared ones live here. Each spec keeps the helpers it is the sole
// caller of: the map's markers, regions and callouts, the panel's list, its
// off-roster rows and its footer.

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

// The shelter rows are buttons with aria-pressed, and so is the sort toggle
// that sits above them. Only a row wraps its label in spans.
export const ROW = "button[aria-pressed]:has(span)";

export function rows(dialog: Locator): Locator {
  return dialog.locator(ROW);
}

export async function openPicker(page: Page): Promise<Locator> {
  await page.goto("/");
  await pickerTrigger(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('svg[role="group"]')).toBeVisible();
  return dialog;
}

// The way out of the dialog. Its label carries the count when there is one to
// carry and falls back to the bare word when there is not, so both spellings
// have to be reachable by one locator.
export function donePill(page: Page): Locator {
  return page.getByRole("button", { name: /^(Pokaži .* živali?|Končano)$/ });
}
