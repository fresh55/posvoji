import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  badge,
  countControl,
  dialog,
  edgePoint,
  expectPhoto,
  FRODO,
  frontPrint,
  KLOPKA,
  KLOPKA_PHOTOS,
  lightbox,
  MIRNA,
  openFan,
  print,
  prints,
} from "./fan";

// The photo fan in the animal dialog, on the layout that has a pointer.
//
// Almost everything here is a property of a real browser rather than of the
// component: a drag is judged on the distance and the velocity between two
// pointer events the engine timestamps, the wheel gesture is measured against
// an element's own width and has an inertia tail only a trackpad produces, a
// hover is a pointer the jsdom suite does not have, and the prints overlap by
// design so what a click lands on is a question about compositing. The unit
// tests in animal-dialog.test.tsx pin the mechanism; this pins that the
// mechanism is reachable.
//
// Klopka is the animal throughout: fourteen photos is past every line the fan
// draws (five prints on stage, a contact sheet in the lightbox, two photos on
// a hard flick), so one gallery exercises all of them.

const FRODO_PHOTOS = 10;
const MIRNA_PHOTOS = 2;

/** The middle of the stage, which is over the print in front. A gesture that
 *  starts here is the one a visitor makes: the pointer events bubble to the
 *  stage, and the click the browser fires afterwards is the stage's to
 *  swallow. */
async function stageCentre(fan: Locator): Promise<{ x: number; y: number }> {
  const box = await fan.boundingBox();
  if (!box) throw new Error("the fan has no box to drag across");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function stageWidth(fan: Locator): Promise<number> {
  const box = await fan.boundingBox();
  if (!box) throw new Error("the fan has no box to measure");
  return box.width;
}

/**
 * That the print in front is standing in the middle of the stage.
 *
 * What a walk left behind is only visible as position: the fan is drawn from
 * the print's seat minus the walk, so a walk that was never put away leaves
 * every print a whole seat or two off with nothing in the middle, while the
 * labels and the count go on saying the right thing.
 */
async function expectCentred(fan: Locator): Promise<void> {
  const stage = await fan.boundingBox();
  const front = await frontPrint(fan).boundingBox();
  if (!stage || !front) throw new Error("the fan has no box to measure");
  const off = Math.abs(
    front.x + front.width / 2 - (stage.x + stage.width / 2),
  );
  expect(off).toBeLessThan(3);
}

/** The accessible name of whatever holds the keyboard, for the tests about
 *  where a walk leaves it. */
function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  );
}

/**
 * A mouse drag across the stage, delivered as real moves.
 *
 * `pauseMs` is the gesture's own speed and not a wait for anything: endSwipe
 * divides the distance by the time between the browser's own timestamps, and
 * the difference between one photo and two is entirely whether that quotient
 * clears FLICK_TWO_PX_MS. A drag with no pauses is a flick however carefully
 * it is worded.
 */
async function dragBy(
  page: Page,
  fan: Locator,
  dx: number,
  { steps, pauseMs }: { steps: number; pauseMs: number },
): Promise<void> {
  const from = await stageCentre(fan);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y);
    if (pauseMs) await page.waitForTimeout(pauseMs);
  }
  await page.mouse.up();
}

test("opens on the first photo, with five prints on stage", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);

  await expectPhoto(fan, 1, KLOPKA_PHOTOS);
  // FAN_LIMIT: five is where a fan still reads as a fan, so a fourteen-photo
  // gallery seats five and walks the window around the rest.
  await expect(prints(fan)).toHaveCount(5);
  // Nothing behind them: empty paper frames used to stand there for a set the
  // fan cannot show at once, and they read as blank cards.
  await expect(fan.locator('[data-slot="photo-deck"]')).toHaveCount(0);
});

test("re-seats every print on a step", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);
  await fan.getByRole("button", { name: "Naslednja fotografija" }).click();
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);

  // After the step photo 2 is in front, 3 stands one seat out on the right and
  // 4, which stepped into the window on this very commit, two seats out behind
  // it. A commit re-seats a print by jumping a value the print holds rather
  // than by rendering it, so this is the browser's to pin: the unit suite can
  // count the renders but jsdom does not carry a jumped value to the element.
  // The print that has only just mounted is the one that was once left at its
  // first pose, on top of its neighbour, which is why it is the one measured.
  const box = async (n: number) => {
    const found = await print(fan, n).boundingBox();
    if (!found) throw new Error(`print ${n} has no box`);
    return found;
  };
  const front = await box(2);
  const near = await box(3);
  const far = await box(4);
  expect(near.x).toBeGreaterThan(front.x);
  // Further out than its neighbour, and smaller, which is what two tiers back
  // looks like; a print stuck at its first pose would sit exactly on top of 3.
  expect(far.x).toBeGreaterThan(near.x + 20);
  expect(far.width).toBeLessThan(near.width);
  await expect(print(fan, 3)).toHaveCSS("z-index", "19");
  await expect(print(fan, 4)).toHaveCSS("z-index", "18");
});

test("turns one photo on a mouse drag, and marks the stage while it runs", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);
  const width = await stageWidth(fan);
  const from = await stageCentre(fan);

  // Pulled left, which walks the fan forward. Well past the 22% of the stage
  // that commits a step, and slowly enough that it is a drag and not a flick.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - width * 0.1, from.y);
  // The stage says a drag is running, which is what hands the whole fan the
  // grabbing cursor: the pointer sits over a photo the entire time and the
  // stage's own rule cannot reach through it.
  await expect(fan).toHaveAttribute("data-dragging", "true");
  for (let i = 2; i <= 10; i++) {
    await page.mouse.move(from.x - width * 0.04 * i, from.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();

  await expect(fan).not.toHaveAttribute("data-dragging", "true");
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);
});

test("turns two photos on a hard flick", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);

  // 220px in four moves with nothing between them: over FLICK_TWO_PX_MS, which
  // is well past the 0.5 px/ms that commits a single step, so it is a gesture
  // somebody meant. Only offered past FAN_LIMIT, because on a short gallery two
  // steps walk past the whole thing and back.
  await dragBy(page, fan, -220, { steps: 4, pauseMs: 0 });

  await expectPhoto(fan, 3, KLOPKA_PHOTOS);
});

test("turns one photo on a horizontal wheel swipe and swallows its tail", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);
  const width = await stageWidth(fan);
  const centre = await stageCentre(fan);
  const before = page.url();
  await page.mouse.move(centre.x, centre.y);

  // One trackpad swipe: a burst that crosses the commit line, then the inertia
  // the browser keeps sending as it decays. All of it is one gesture, so all of
  // it is one photo.
  const push = Math.ceil(width * 0.12);
  const burst = [push, push, push, push * 0.5, push * 0.25, 8, 4, 2, 1];
  for (const delta of burst) {
    await page.mouse.wheel(Math.round(delta), 0);
  }

  await expectPhoto(fan, 2, KLOPKA_PHOTOS);
  // Past WHEEL_SETTLE_MS, so the gesture is over and a second step would have
  // had its chance. This is the one wait in the file that has to be a clock:
  // what is being pinned is that nothing further happens.
  await page.waitForTimeout(500);
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);
  // Two fingers sideways on a Mac trackpad is the browser's back gesture
  // unless the fan prevents it, and the visitor would leave the site instead
  // of seeing the next photo.
  expect(page.url()).toBe(before);
});

test("leaves the fan alone on a vertical wheel", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);
  const centre = await stageCentre(fan);
  await page.mouse.move(centre.x, centre.y);

  // Anything not dominantly horizontal belongs to whatever scrolls around the
  // stage, and the fan does not prevent it either.
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);

  await page.waitForTimeout(500);
  await expectPhoto(fan, 1, KLOPKA_PHOTOS);
});

test("walks with the arrows from one press of the keyboard, and jumps to the ends", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);

  // Focused once, and every key after this is the page's. The handler is the
  // stage's and the keys reach it by bubbling from the print, so a walk that
  // carries the focused print more than two seats out unmounts the very
  // element the next key would have come from: this used to go dead on the
  // fourth arrow, and pressing on frontPrint each time hid it.
  await frontPrint(fan).focus();

  for (let n = 2; n <= 6; n++) {
    await page.keyboard.press("ArrowRight");
    await expectPhoto(fan, n, KLOPKA_PHOTOS);
  }

  await page.keyboard.press("ArrowLeft");
  await expectPhoto(fan, 5, KLOPKA_PHOTOS);

  await page.keyboard.press("Home");
  await expectPhoto(fan, 1, KLOPKA_PHOTOS);

  // Fourteen photos is a long walk one arrow at a time, so both ends are one
  // key. The fan still walks rather than jumps, which is what says the stack
  // moved.
  await page.keyboard.press("End");
  await expectPhoto(fan, KLOPKA_PHOTOS, KLOPKA_PHOTOS);

  // And the keyboard is still on the fan, on the photo that is showing, so
  // Enter opens the one being looked at.
  expect(await focusedName(page)).toBe(
    `Odpri fotografijo ${KLOPKA_PHOTOS} čez cel zaslon`,
  );
});

test("keeps a two-photo fan on its seats through two quick arrows", async ({
  page,
}) => {
  const fan = await openFan(page, MIRNA);
  await expectPhoto(fan, 1, MIRNA_PHOTOS);

  // Two photos wrap, so the second arrow's target is the photo the first one
  // is leaving. The walk used to be taken anyway and committed the index the
  // fan was already on, which re-seated nothing: the pair was left standing
  // two seats out with the middle of the stage empty.
  await frontPrint(fan).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await expectPhoto(fan, 2, MIRNA_PHOTOS);
  await expect(frontPrint(fan)).toHaveCount(1);
  await expectCentred(fan);
});

test("steps back the short way round on a two-photo fan", async ({ page }) => {
  const fan = await openFan(page, MIRNA);

  // A pair keeps to its numbered sides rather than walking round a middle, so
  // photo 2 stands on the right of photo 1 whichever of them is in front.
  const sides = async () => {
    const first = await print(fan, 1).boundingBox();
    const second = await print(fan, 2).boundingBox();
    if (!first || !second) throw new Error("a print has no box to measure");
    return second.x > first.x;
  };
  expect(await sides()).toBe(true);

  await frontPrint(fan).focus();
  await page.keyboard.press("ArrowRight");
  await expectPhoto(fan, 2, MIRNA_PHOTOS);
  expect(await sides()).toBe(true);

  // Which is why the step on from photo 2 walks left: photo 1 is seated there.
  // The fan used to walk the difference between the two numbers instead, which
  // sent it the wrong way and had the commit snap the pair across the stage.
  await page.keyboard.press("ArrowRight");
  await expectPhoto(fan, 1, MIRNA_PHOTOS);
  await expectCentred(fan);
  expect(await sides()).toBe(true);
});

test("lifts a stacked print under the pointer", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);
  // The second photo sits one seat to the right of the front one, so the strip
  // of it that shows is its right edge.
  const stacked = print(fan, 2);

  /** The scale on the print's hover layer. Read as the length of the
   *  transformed unit vector, because the same layer carries the straighten
   *  and a rotated matrix's first entry is not its scale. */
  async function lift(): Promise<number> {
    return stacked.evaluate((button) => {
      const layer = button.querySelector('[data-slot="photo-print"]')
        ?.parentElement;
      if (!layer) throw new Error("the print has no hover layer");
      const { transform } = getComputedStyle(layer);
      if (transform === "none") return 1;
      const matrix = new DOMMatrixReadOnly(transform);
      return Math.hypot(matrix.a, matrix.b);
    });
  }

  expect(await lift()).toBeCloseTo(1, 2);

  const point = await edgePoint(stacked, "right");
  await page.mouse.move(point.x, point.y);

  // HOVER_SCALE. Polled because the lift is a spring, not a class.
  await expect.poll(lift, { timeout: 5000 }).toBeCloseTo(1.08, 2);
});

test("opens the lightbox on the front print, jumps with a digit, and closes back to the fan", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);

  await frontPrint(fan).click();
  const full = lightbox(page);
  await expect(full).toBeVisible();

  // A number is the way across a set the arrows walk one at a time. Nine is
  // where it stops, so five is inside it.
  await page.keyboard.press("5");
  await expect(full.locator('[data-slot="badge"]')).toHaveText(
    `5 / ${KLOPKA_PHOTOS}`,
  );

  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();
  // Only the lightbox. The dialog under it is a separate Radix dialog and the
  // key belongs to the topmost one.
  await expect(dialog(page)).toBeVisible();
  // And the fan is holding what the lightbox was left on, because both read
  // the same index.
  await expectPhoto(fan, 5, KLOPKA_PHOTOS);
});

test("hands the keyboard back to the fan when the print it came from is gone", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);

  await frontPrint(fan).focus();
  for (let n = 2; n <= 4; n++) {
    await page.keyboard.press("ArrowRight");
    await expectPhoto(fan, n, KLOPKA_PHOTOS);
  }

  await frontPrint(fan).click();
  const full = lightbox(page);
  await expect(full).toBeVisible();

  // The lightbox and the fan share the index, so a jump across the set walks
  // the fan behind it: photo 4 is five seats away by the time this closes, off
  // the stage and unmounted. Focus handed back to it landed on nothing, and
  // the dialog under the lightbox went dead with it.
  await page.keyboard.press("9");
  await expect(full.locator('[data-slot="badge"]')).toHaveText(
    `9 / ${KLOPKA_PHOTOS}`,
  );

  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();
  await expectPhoto(fan, 9, KLOPKA_PHOTOS);
  expect(await focusedName(page)).toBe("Odpri fotografijo 9 čez cel zaslon");
});

test("opens the contact sheet from the count, which is a control of its own", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA);

  // The count is what names the whole gallery, so it is the way into it. It
  // used to be a span inside the front print's own button, with a click
  // handler: a control nested in a control, hidden from assistive technology
  // and out of the tab order, so the sheet had no keyboard way in from here.
  const count = countControl(fan);
  await expect(count).toHaveAccessibleName(
    `Vse fotografije (${KLOPKA_PHOTOS})`,
  );
  await expect(count).toHaveText(`1 / ${KLOPKA_PHOTOS}`);
  await expect(badge(fan)).toHaveText(`1 / ${KLOPKA_PHOTOS}`);

  // The mark stays 20px and its hit area is drawn past it, which a class alone
  // cannot prove: the badge clips its own children, and the pseudo-element was
  // cut off by that until the clip was lifted. Hit-tested, the way the touch
  // targets in this suite are.
  const box = await count.boundingBox();
  if (!box) throw new Error("the count has no box to measure");
  const reach = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x, y)
        ?.closest("button")
        ?.getAttribute("aria-label") ?? null,
    [box.x - 5, box.y + box.height / 2],
  );
  expect(reach).toBe(`Vse fotografije (${KLOPKA_PHOTOS})`);

  await count.click();

  const sheet = page.locator('[data-slot="photo-lightbox-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveCount(KLOPKA_PHOTOS);
  await expect(sheet.locator('button[aria-current="true"]')).toHaveAttribute(
    "aria-label",
    "Pokaži fotografijo 1",
  );
});

test("writes the photo on show into the share link", async ({ page }) => {
  const fan = await openFan(page, KLOPKA);
  const share = dialog(page).getByRole("button", { name: "Deli" });
  const link = page.getByRole("textbox", { name: "Povezava" });

  await share.click();
  // The first photo is where the page opens anyway, so a link that says so
  // says nothing extra. It is the address people read out loud.
  await expect(link).toHaveValue(/\/zival\//);
  expect(await link.inputValue()).not.toContain("foto=");

  await page.keyboard.press("Escape");
  await expect(link).toBeHidden();
  await expect(dialog(page)).toBeVisible();

  await fan.getByRole("button", { name: "Naslednja fotografija" }).click();
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);

  await share.click();
  await expect(link).toHaveValue(/\?foto=2$/);
});

test("opens on the photo a link names, and starts the next animal at its first", async ({
  page,
}) => {
  const fan = await openFan(page, KLOPKA, { params: "foto=3" });

  await expectPhoto(fan, 3, KLOPKA_PHOTOS);
  // The rewrite off ?zival= is the one place the photo survives, because it is
  // the same animal arriving at its own address.
  await expect(page).toHaveURL(/\?foto=3$/);

  await dialog(page).getByRole("button", { name: "Naslednja žival" }).click();

  // ?foto= names a photo of one animal, so it cannot travel with the visitor.
  // The fan is remounted for the animal stepped to, and the count on its badge
  // is that animal's own, so only the front print's label is read here.
  await expect(frontPrint(fan)).toHaveAttribute(
    "aria-label",
    "Odpri fotografijo 1 čez cel zaslon",
  );
  expect(page.url()).not.toContain("foto");
});

test("opens the animal's own page on the photo the link names", async ({
  page,
}) => {
  // The page path is the dialog's own rewrite, read back rather than spelled
  // out here: the slug is built from the animal's name, city and shelter, and
  // a copy of that rule in a spec is a second place for it to be wrong.
  await openFan(page, KLOPKA);
  const path = new URL(page.url()).pathname;

  await page.goto(`${path}?foto=2`);

  // A cold load of a link out of the share sheet renders the page, not the
  // dialog, so ?foto= has to be answered a second time. The visible marker is
  // dots with no text, and this line is what says where the gallery is.
  await expect(page.locator('[data-slot="photo-position"]')).toHaveText(
    `Fotografija 2 od ${KLOPKA_PHOTOS}`,
  );
});

test("keeps a portrait gallery's prints upright and tucked under the front", async ({
  page,
}) => {
  const fan = await openFan(page, FRODO);
  await expectPhoto(fan, 1, FRODO_PHOTOS);

  // The same sheet of paper turned upright, rather than a bigger or smaller
  // one: the 4:3 box's height is what stays fixed and the width gives way.
  const shapes = await prints(fan).evaluateAll((seats) =>
    seats.map((seat) => (seat as HTMLElement).style.aspectRatio),
  );
  // "0.75 / 1" and not "0.75": printBox states the ratio as a bare number and
  // the CSSOM hands it back in the two-value form the property is defined in.
  expect(shapes).toEqual(Array(5).fill("0.75 / 1"));

  // A seat is a share of the print in front's own width, not a distance from
  // the middle of the stage. Measured the second way, a narrower print floated
  // beside the front one instead of tucking under it.
  const front = await frontPrint(fan).boundingBox();
  const neighbour = await print(fan, 2).boundingBox();
  if (!front || !neighbour) throw new Error("a print has no box to measure");
  expect(neighbour.x).toBeGreaterThan(front.x);
  expect(neighbour.x).toBeLessThan(front.x + front.width);
});
