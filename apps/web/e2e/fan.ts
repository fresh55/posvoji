import { expect, type Locator, type Page } from "@playwright/test";

// The selector contract the photo-fan specs are written against, in one place.
// Not a .spec.ts, so Playwright's default testMatch leaves it alone.
//
// One layout of the fan is mounted at a time: photo-spread.tsx draws PHONE_FAN
// or DESKTOP_FAN from the same component, chosen by the sm media query, and
// the other one is not in the document at all. Every locator here is still
// scoped to the stage rather than taken off the page, because the lightbox's
// contact sheet names its tiles the same way the prints are named, and a bare
// getByRole("button", { name: "Pokaži fotografijo 2" }) would match both once
// the sheet is open.

/** Which of the two stages a spec is driving. */
export type FanLayout = "desktop" | "phone";

const FAN_SLOT: Record<FanLayout, string> = {
  desktop: "photo-spread",
  phone: "photo-fan",
};

// The animals these specs open, by id. Named here because the specs share them
// and because a dataset that has stopped carrying one should fail in one
// obvious place rather than as a dozen unexplained assertions.
//
// Klopka is the register's longest gallery: fourteen photos of mixed shapes,
// which is past FAN_LIMIT (five prints on stage) and past SHEET_FROM (the
// lightbox offers its contact sheet).
export const KLOPKA = "horjul:862";
// The size of that gallery, which four specs count against. Here for the same
// reason the id is: one obvious place to fail when the dataset changes.
export const KLOPKA_PHOTOS = 14;
// Ten photos, every one of them 3:4. The fan's portrait case: a narrower print
// of the same height, seated so it still tucks under the front one.
export const FRODO = "ljubljana:15a044ff-1262-4693-96dc-aaa3619c1055";
// Two photos, which is the fan's smallest walk and its only wrapping one: the
// pair keeps to its numbered sides rather than walking round a middle, so a
// step's direction and the seat it travels from are not the same number. Two
// arrows in a row here target the photo the first one is leaving.
export const MIRNA = "macja-hisa:4026";

/** The animal dialog the fan is drawn inside. */
export function dialog(page: Page): Locator {
  return page.locator('[data-slot="animal-dialog"]');
}

/**
 * The full-screen view a print opens into.
 *
 * A Radix layer of its own over the dialog, which is why the two are named
 * apart: a key or a gesture belongs to the topmost one, and what closing the
 * lightbox left the dialog in is a question about the layer underneath.
 */
export function lightbox(page: Page): Locator {
  return page.locator('[data-slot="photo-lightbox"]');
}

/**
 * Opens an animal's dialog from the index and hands back the fan on stage.
 *
 * ?zival= is the address the dialog wrote before every animal had a page, and
 * those links are still out in the world, so it is the shortest way in from
 * here. The dialog rewrites the address to the animal's own page once it has
 * opened (use-animal-dialog.ts), which is why the specs that care about the
 * URL read it after this rather than before.
 *
 * The index ships prerendered with no dialog in it and hydration is what reads
 * the address, so the fan is waited for rather than assumed.
 */
export async function openFan(
  page: Page,
  id: string,
  {
    layout = "desktop",
    params = "",
  }: { layout?: FanLayout; params?: string } = {},
): Promise<Locator> {
  await page.goto(
    `/?zival=${encodeURIComponent(id)}${params ? `&${params}` : ""}`,
  );
  const fan = page.locator(`[data-slot="${FAN_SLOT[layout]}"]`);
  await expect(fan).toBeVisible();
  return fan;
}

/** The fan the other layout draws, which is the one that must not be on
 *  screen. */
export function otherFan(page: Page, layout: FanLayout): Locator {
  return page.locator(
    `[data-slot="${FAN_SLOT[layout === "phone" ? "desktop" : "phone"]}"]`,
  );
}

/** The print in front. It is the only one with aria-pressed="true": `active`
 *  is `offset === 0`, and the offsets come from the committed index, so
 *  exactly one print answers to this at any point of a walk. */
export function frontPrint(fan: Locator): Locator {
  return fan.locator('button[aria-pressed="true"]');
}

/** One of the prints on stage, by the photo it holds. */
export function print(fan: Locator, n: number): Locator {
  return fan.locator(
    `button[aria-label="Odpri fotografijo ${n} čez cel zaslon"], button[aria-label="Pokaži fotografijo ${n}"]`,
  );
}

/** Every print the fan has seated. Five at most, whatever the gallery holds. */
export function prints(fan: Locator): Locator {
  return fan.locator("button[aria-pressed]");
}

/**
 * The "N / total" mark, wherever the fan has drawn it.
 *
 * Two shapes, and never both at once. Under SHEET_FROM it is a span inside the
 * front print, aria-hidden, read as text rather than through the accessibility
 * tree. From SHEET_FROM up the same mark is a button of its own, drawn over the
 * front print, because there it is also the way into the contact sheet and a
 * control cannot be nested inside the print's button.
 */
export function badge(fan: Locator): Locator {
  return fan.locator(
    'button[aria-pressed="true"] [data-slot="badge"], button[data-slot="badge"]',
  );
}

/** The count as a control: the way into the whole set, on a gallery the fan
 *  cannot show at once. Absent on a shorter one, where badge() is a mark. */
export function countControl(fan: Locator): Locator {
  return fan.locator('button[data-slot="badge"]');
}

/**
 * Which photo the fan is showing, said the two ways the fan says it.
 *
 * Auto-retrying, because every step is a walk: the fan animates `progress` and
 * commits the new index when the animation lands, so nothing about a step is
 * true on the tick the gesture ended.
 */
export async function expectPhoto(
  fan: Locator,
  n: number,
  total: number,
): Promise<void> {
  await expect(frontPrint(fan)).toHaveAttribute(
    "aria-label",
    `Odpri fotografijo ${n} čez cel zaslon`,
  );
  await expect(badge(fan)).toHaveText(`${n} / ${total}`);
}

/**
 * A viewport point that really lands on `target`, found by hit-testing in from
 * one of its edges.
 *
 * The fan overlaps on purpose: a stacked print is mostly under the front one,
 * so only a sliver at its outer edge belongs to it and a click or a hover
 * aimed at the centre would be delivered to the print in front. The bounding
 * box alone is not enough to aim with either: the prints are rotated, so a few
 * pixels in from the box's own edge is still in the empty corner beside the
 * paper.
 *
 * elementFromPoint is what settles it, the same way the touch-target checks in
 * this suite do: it answers with the element that would actually receive the
 * event.
 */
export async function edgePoint(
  target: Locator,
  side: "left" | "right",
): Promise<{ x: number; y: number }> {
  const point = await target.evaluate((element, from) => {
    const box = element.getBoundingClientRect();
    // Clamped into the viewport before anything is asked of it. On a phone the
    // fan is wider than the screen on purpose (the stage clips it), so a print
    // one seat out has its outer edge past the screen edge, and
    // elementFromPoint answers null for a point that is not on screen at all.
    // A scan that starts there walks its whole budget through nulls and
    // concludes the print is covered.
    const y = Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 1);
    const step = from === "left" ? 2 : -2;
    const start =
      from === "left"
        ? Math.max(box.left + 1, 1)
        : Math.min(box.right - 1, window.innerWidth - 1);
    // As far in as the element is wide: past that the answer is not "covered"
    // but "this is the wrong element".
    const reach = Math.ceil(box.width / 2);
    for (let i = 0; i < reach; i++) {
      const x = start + step * i;
      if (x < 0 || x > window.innerWidth) break;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit))) return { x, y };
    }
    return null;
  }, side);
  if (!point) {
    throw new Error(`nothing of this element is reachable from its ${side} edge`);
  }
  return point;
}
