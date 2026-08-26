import type { Page } from "@playwright/test";

// The results grid's own card locator, shared by the specs that read its
// count rather than click into it. Not a .spec.ts, so Playwright's default
// testMatch leaves it alone.

export function cards(page: Page) {
  return page.locator('[data-slot="results"] article');
}
