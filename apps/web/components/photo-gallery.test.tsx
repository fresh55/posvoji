// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import type { ClientAnimal } from "@/lib/animal";
import { FAN_PHOTO_SIZES } from "@/lib/animal-images";
import { CARD_PHOTO_SIZES } from "@/lib/card-grid";
import { animalsForClient } from "@/lib/dataset";
import { capturePreloads, pointer } from "@/test/pointer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-01-01T00:00:00.000Z");

// The frame the swipe measures against. jsdom lays nothing out, so
// clientWidth is 0 and the distance threshold would be `|dx| > 0.22` - every
// twitch a committed swipe. Stubbing it is what makes these tests about the
// heuristics rather than about jsdom.
const FRAME_WIDTH = 300;
const FAR = FRAME_WIDTH * 0.22;

// Written in the dataset's own shape and handed over through the projection
// the server runs, so the gallery is given exactly what it is given on the
// page: photos already resolved to the file each one is drawn from.
function animal(rest: Partial<Animal> = {}): ClientAnimal {
  return animalsForClient([schemaAnimal(rest)])[0]!;
}

function schemaAnimal(rest: Partial<Animal> = {}): Animal {
  return {
    id: "rex",
    source: {
      providerId: "test-shelter",
      sourceAnimalId: "rex",
      sourceUrl: "https://example.test/animals/rex",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
    name: "Rex",
    species: "dog",
    status: "available",
    images: Array.from({ length: 3 }, (_, i) => ({
      sourceUrl: `https://example.test/photo-${i}.jpg`,
      rights: "display-permitted" as const,
    })),
    attribution: "Foto: Zavetišče Test",
    ...rest,
  };
}

/** Returns whether the click was allowed through to the browser. */
function click(element: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  fireEvent(element, event);
  return !event.defaultPrevented;
}

let opened: string[];

function setup(rest: Partial<Animal> = {}) {
  opened = [];
  render(
    <I18nProvider locale="sl">
      <AnimalCard
        animal={animal(rest)}
        reference={NOW}
        onOpen={(id) => opened.push(id)}
      />
    </I18nProvider>,
  );
  const surface = document.querySelector('[data-slot="photo-frame"] a');
  if (!surface) throw new Error("no photo surface");
  Object.defineProperty(surface, "clientWidth", {
    value: FRAME_WIDTH,
    configurable: true,
  });
  return surface;
}

/** Where the gallery is, read from the line that speaks it. The visible marker
 *  is a row of dots now, which carries no text to assert on; the spoken
 *  sentence and the dots are driven by the same index.
 *
 *  Found by data-slot rather than by ".sr-only", which was whichever such node
 *  came first in the document, and parsed with a digit-pair pattern that does
 *  not depend on the Slovene wording around it. */
function counter() {
  const text =
    document.querySelector('[data-slot="photo-position"]')?.textContent ?? "";
  const match = text.match(/(\d+)\D+(\d+)/);
  return match ? `${match[1]} / ${match[2]}` : null;
}

// Cached copies with the ladder ingest derives, for the tests that are about
// which file a browser is offered. The gallery's own fixture above stays on
// display-permitted photos, which is the single-file fallback.
const CACHED: Animal["images"] = Array.from({ length: 3 }, (_, i) => ({
  sourceUrl: `https://example.test/photo-${i}.jpg`,
  cachedUrl: `/media/animals/photo-${i}.webp`,
  width: 800,
  height: 600,
  widths: [320, 480, 640, 800],
  blurDataURL: "data:image/webp;base64,UklGRg==",
  rights: "cache-permitted" as const,
}));

// Four, so the photo the dialog opens on and its two neighbours are three
// different files rather than the same one twice.
const CACHED_FOUR: Animal["images"] = Array.from({ length: 4 }, (_, i) => ({
  sourceUrl: `https://example.test/photo-${i}.jpg`,
  cachedUrl: `/media/animals/photo-${i}.webp`,
  width: 800,
  height: 600,
  widths: [320, 480, 640, 800],
  blurDataURL: "data:image/webp;base64,UklGRg==",
  rights: "cache-permitted" as const,
}));


describe("photo gallery candidates", () => {
  it("offers the card's photo as a ladder, with the card's own sizes", () => {
    setup({ images: CACHED });

    const photo = document.querySelector('[data-slot="photo-frame"] img');
    expect(photo?.getAttribute("srcset")).toBe(
      "/media/animals/photo-0-320.webp 320w, " +
        "/media/animals/photo-0-480.webp 480w, " +
        "/media/animals/photo-0-640.webp 640w, " +
        "/media/animals/photo-0.webp 800w",
    );
    // The string the grid's own layout derives. A card that stated its width
    // by hand would go stale the first time the grid changed.
    expect(photo?.getAttribute("sizes")).toBe(CARD_PHOTO_SIZES);
  });

  it("shows the inline placeholder under the photo while it loads", () => {
    setup({ images: CACHED });

    const layer = document.querySelector(
      '[data-slot="photo-frame"] div[aria-hidden][style*="background-image"]',
    );
    expect(layer?.getAttribute("style")).toContain("data:image/webp;base64,");
  });

  it("leaves a photo with no cached copy on its single source", () => {
    // The card fixture's own photos: display-permitted, served from the
    // shelter, with no ladder and no placeholder to offer.
    setup();

    const photo = document.querySelector('[data-slot="photo-frame"] img');
    expect(photo?.getAttribute("src")).toBe("https://example.test/photo-0.jpg");
    expect(photo?.getAttribute("srcset")).toBeNull();
    expect(
      document.querySelector(
        '[data-slot="photo-frame"] div[aria-hidden][style*="background-image"]',
      ),
    ).toBeNull();
  });

  it("preloads the rung the layout would pick, not the largest file", () => {
    const preloads = capturePreloads();
    setup({ images: CACHED });

    // Stepping the gallery warms the two photos either side of the new one.
    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));

    expect(preloads).toHaveLength(2);
    // The same ladder and the same sizes the rendered photo carries, so the
    // browser runs its own selection and the visitor's later request is a
    // cache hit rather than a second, different file.
    expect(preloads[0].srcset).toContain("/media/animals/photo-0-320.webp 320w");
    expect(preloads[0].srcset).toContain("/media/animals/photo-0.webp 800w");
    expect(preloads[0].sizes).toBe(CARD_PHOTO_SIZES);
    expect(preloads[0].src).toBe("/media/animals/photo-0.webp");
  });

  it("preloads a shelter-hosted photo with nothing to choose between", () => {
    const preloads = capturePreloads();
    setup();

    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));

    expect(preloads[0].src).toBe("https://example.test/photo-0.jpg");
    expect(preloads[0].srcset).toBe("");
    expect(preloads[0].sizes).toBe("");
  });
});

// Comfortably past PRELOAD_DWELL_MS, which the component keeps to itself.
// What these tests are about is that the dwell has to elapse at all, not the
// exact length of it, so they wait longer than it rather than matching it.
const PAST_DWELL_MS = 500;

describe("photo gallery dwell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warms what the dialog's fan mounts first, at the fan's own sizes", () => {
    const preloads = capturePreloads();
    const surface = setup({ images: CACHED_FOUR });

    fireEvent.pointerEnter(surface);
    // A pointer crossing the grid is not asking for anything, so nothing is
    // fetched until it has stayed.
    expect(preloads).toHaveLength(0);
    vi.advanceTimersByTime(PAST_DWELL_MS);

    // The card's own neighbours, unchanged: this gallery's sizes, the photos
    // either side of the one on show.
    expect(
      preloads.filter((image) => image.sizes === CARD_PHOTO_SIZES).map((i) => i.src),
    ).toEqual(["/media/animals/photo-3.webp", "/media/animals/photo-1.webp"]);

    // And the three prints the fan mounts nearest the front, at the sizes the
    // fan draws them with. The dialog opens on the first photo whatever this
    // card is showing, so the window is fixed at index 0.
    const warm = preloads.filter((image) => image.sizes === FAN_PHOTO_SIZES);
    expect(warm.map((image) => image.src)).toEqual([
      "/media/animals/photo-0.webp",
      "/media/animals/photo-3.webp",
      "/media/animals/photo-1.webp",
    ]);
    // The whole ladder, so the browser picks the rung the fan's layout asks
    // for. That is a different file from the card's, which is the entire
    // reason this second warm exists.
    expect(warm[0].srcset).toContain("/media/animals/photo-0-640.webp 640w");
  });

  it("asks for nothing extra on a gallery that opens no such surface", () => {
    const preloads = capturePreloads();
    const surface = setupPlain({ images: CACHED_FOUR })!;

    fireEvent.pointerEnter(surface);
    vi.advanceTimersByTime(PAST_DWELL_MS);

    // The animal's own page mounts this gallery with no warmSizes. Its two
    // neighbours are all it may fetch.
    expect(preloads.map((image) => image.src)).toEqual([
      "/media/animals/photo-3.webp",
      "/media/animals/photo-1.webp",
    ]);
    expect(preloads.every((image) => image.sizes === "100vw")).toBe(true);
  });
});

describe("photo gallery swipe", () => {
  beforeEach(() => {
    opened = [];
  });

  it("turns the page on a drag past the distance threshold", () => {
    const surface = setup();
    expect(counter()).toBe("1 / 3");

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 200 - FAR - 20, y: 80 });
    pointer(surface, "pointerup", { x: 200 - FAR - 20, y: 80 });

    expect(counter()).toBe("2 / 3");
  });

  it("swallows exactly the one click the swipe produced, and no more", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 200 - FAR - 20, y: 80 });
    pointer(surface, "pointerup", { x: 200 - FAR - 20, y: 80 });

    // The compatibility click that follows a touch gesture is the swipe's, not
    // a request to open the animal.
    expect(click(surface)).toBe(false);
    expect(opened).toEqual([]);

    // The next one is a real tap and has to get through. This is the invariant
    // the suppression flag exists to hold, and the one most likely to break
    // silently: it is a mutable ref read across four handlers.
    click(surface);
    expect(opened).toEqual(["rex"]);
  });

  it("treats a fast few-pixel twitch as a tap, not a flick", () => {
    const surface = setup();

    // Velocity alone used to commit this: 4px over one frame clears 0.5px/ms
    // comfortably, and the tap that meant to open the animal was eaten along
    // with it.
    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 196, y: 80 });
    pointer(surface, "pointerup", { x: 196, y: 80 });

    expect(counter()).toBe("1 / 3");
    click(surface);
    expect(opened).toEqual(["rex"]);
  });

  it("does not open the animal when a sideways drag ends downward", () => {
    const surface = setup();

    // The axis used to be re-tested on the two endpoints, so curling downward
    // before lifting made the handler bail before it set the suppression flag
    // and the click went through: a 100px drag opened a full-screen dialog.
    // Horizontally dominant while dragging, vertically dominant by the time
    // the finger lifts. The old endpoint test saw only the second half.
    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 100, y: 85 });
    pointer(surface, "pointerup", { x: 100, y: 260 });

    expect(click(surface)).toBe(false);
    expect(opened).toEqual([]);
  });

  it("leaves a vertical drag to the page", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 203, y: 160 });
    pointer(surface, "pointerup", { x: 203, y: 220 });

    expect(counter()).toBe("1 / 3");
    click(surface);
    expect(opened).toEqual(["rex"]);
  });

  it("does not carry a stale suppression into a later mouse click", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 200 - FAR - 20, y: 80 });
    pointer(surface, "pointerup", { x: 200 - FAR - 20, y: 80 });

    // On a hybrid device the compatibility click may never arrive, which used
    // to leave the flag set: the mouse bailed out of startSwipe before the
    // reset, and the next real click was eaten instead.
    pointer(surface, "pointerdown", { x: 200, y: 80, pointerType: "mouse" });
    click(surface);

    expect(opened).toEqual(["rex"]);
  });

  it("lets a held modifier through even when a swipe is suppressing", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 200 - FAR - 20, y: 80 });
    pointer(surface, "pointerup", { x: 200 - FAR - 20, y: 80 });

    // A modified click is asking the browser for a tab, and the href is a real
    // deep link. Suppression must not swallow that.
    expect(click(surface, { metaKey: true })).toBe(true);
    expect(opened).toEqual([]);
  });

  it("ignores a second finger instead of measuring against its origin", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80, pointerId: 1 });
    // A pinch's second finger used to overwrite the first one's origin, so
    // lifting the first measured 200 against 40 and cleared the distance
    // threshold on a gesture that was never a swipe.
    pointer(surface, "pointerdown", { x: 40, y: 80, pointerId: 2 });
    pointer(surface, "pointerup", { x: 200, y: 80, pointerId: 1 });

    expect(counter()).toBe("1 / 3");
  });

  it("forgets a cancelled gesture rather than stranding it", () => {
    const surface = setup();

    pointer(surface, "pointerdown", { x: 200, y: 80 });
    pointer(surface, "pointermove", { x: 120, y: 80 });
    pointer(surface, "pointercancel", { x: 120, y: 80 });

    expect(counter()).toBe("1 / 3");
    // A cancelled gesture leaves nothing behind for the next tap to trip over.
    click(surface);
    expect(opened).toEqual(["rex"]);
  });
});

// The animal's own page mounts the same gallery with no href. There is no card
// link there for the arrow keys to live on, so the frame itself has to be the
// way through the photos.
function setupPlain(rest: Partial<Animal> = {}) {
  render(
    <I18nProvider locale="sl">
      <PhotoGallery images={animal(rest).images} name="Rex" sizes="100vw" />
    </I18nProvider>,
  );
  return document.querySelector('[data-slot="photo-frame"] > div');
}

describe("photo gallery without a link", () => {
  it("takes the focus and walks the photos with the arrow keys", () => {
    const surface = setupPlain()!;

    expect(surface.getAttribute("tabindex")).toBe("0");
    expect(surface.getAttribute("role")).toBe("group");
    expect(surface.getAttribute("aria-keyshortcuts")).toBe(
      "ArrowLeft ArrowRight Home End",
    );

    // 425 animals carry more than one photo, and before this every one of
    // them showed a keyboard visitor the first photo and nothing else.
    // preventDefault, so the page does not scroll out from under them.
    expect(fireEvent.keyDown(surface, { key: "ArrowRight" })).toBe(false);
    expect(counter()).toBe("2 / 3");
    fireEvent.keyDown(surface, { key: "ArrowLeft" });
    expect(counter()).toBe("1 / 3");
  });

  it("jumps to the ends of a long gallery with Home and End", () => {
    const surface = setupPlain()!;

    fireEvent.keyDown(surface, { key: "End" });
    expect(counter()).toBe("3 / 3");
    fireEvent.keyDown(surface, { key: "Home" });
    expect(counter()).toBe("1 / 3");
  });

  it("leaves a key it does not answer to the page", () => {
    const surface = setupPlain()!;

    expect(fireEvent.keyDown(surface, { key: "ArrowDown" })).toBe(true);
    expect(counter()).toBe("1 / 3");
  });

  it("names the group and lets the picture say which photo is showing", () => {
    setupPlain();

    expect(
      screen.getByRole("group", { name: "Fotografija: Rex" }),
    ).toBeTruthy();
    expect(screen.getByAltText("Fotografija: Rex, 1 od 3")).toBeTruthy();
  });

  it("gives the chevrons back to the tab order and the reader", () => {
    setupPlain();

    // On the grid card these are a pointer affordance and nothing else,
    // because the arrows on the card's own link are the keyboard's route.
    // Here there is no such link, so they are ordinary buttons.
    for (const name of ["Prejšnja fotografija", "Naslednja fotografija"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("tabindex")).toBeNull();
      expect(button.getAttribute("aria-hidden")).toBeNull();
    }

    fireEvent.click(screen.getByRole("button", { name: "Naslednja fotografija" }));
    expect(counter()).toBe("2 / 3");
  });

  it("offers no group and no keys for a single photo", () => {
    const surface = setupPlain({
      images: [
        {
          sourceUrl: "https://example.test/photo-0.jpg",
          rights: "display-permitted" as const,
        },
      ],
    })!;

    // Nothing to walk: a lone photo is a picture, not a gallery, and a tab
    // stop that answers no key is a tab stop wasted.
    expect(surface.getAttribute("tabindex")).toBeNull();
    expect(surface.getAttribute("role")).toBeNull();
  });
});

describe("photo gallery controls", () => {
  it("keeps the invisible chevrons from taking taps meant for the photo", () => {
    setup();

    const previous = screen.getByLabelText("Prejšnja fotografija");
    const next = screen.getByLabelText("Naslednja fotografija");

    for (const button of [previous, next]) {
      // opacity-0 does not remove hit-testing, and touch has no hover, so
      // without this these were two invisible, permanently tappable discs
      // sitting on about a tenth of the photo.
      expect(button.className).toContain("pointer-events-none");
      expect(button.className).toContain("group-hover/photo:pointer-events-auto");
      // Out of the tab order; the arrows on the card's link are the keyboard's
      // way through the gallery.
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("still steps the gallery when a chevron is actually clicked", () => {
    setup();

    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));
    expect(counter()).toBe("2 / 3");

    fireEvent.click(screen.getByLabelText("Prejšnja fotografija"));
    expect(counter()).toBe("1 / 3");
  });

  it("leaves the dots out of the way of the photo's own link", () => {
    setup();

    const dots = document.querySelector('[data-slot="photo-dots"]');
    expect(dots?.className).toContain("pointer-events-none");
    expect(dots?.getAttribute("aria-hidden")).toBe("true");
    // One dot per photo while the gallery is short enough to draw them all.
    expect(dots?.childElementCount).toBe(3);
  });

  it("caps a long gallery at five dots and slides the window", () => {
    setup({
      images: Array.from({ length: 14 }, (_, i) => ({
        sourceUrl: `https://example.test/photo-${i}.jpg`,
        rights: "display-permitted" as const,
      })),
    });

    const dots = () => document.querySelector('[data-slot="photo-dots"]')!;
    expect(dots().childElementCount).toBe(5);

    // Stepping deep into the gallery keeps five dots on screen rather than
    // drawing fourteen across the photo.
    const next = screen.getByLabelText("Naslednja fotografija");
    for (let i = 0; i < 9; i++) fireEvent.click(next);
    expect(dots().childElementCount).toBe(5);
    expect(counter()).toBe("10 / 14");
  });

  it("keeps pinch-to-zoom on the photo", () => {
    const surface = setup();

    // touch-action: pan-y excludes pinch-zoom, which turned off zoom on the
    // one element a low-vision visitor most wants to zoom.
    expect(surface.className).toContain("touch-pinch-zoom");
  });

  it("stays silent until the visitor has actually driven it", () => {
    setup();

    // The grid mounts one of these per multi-photo card. A live region per
    // card is 425 of them in one document, so it only speaks once this
    // gallery has been used.
    const live = () => document.querySelector('[data-slot="photo-position"]');
    expect(live()?.getAttribute("aria-live")).toBeNull();

    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));
    expect(live()?.getAttribute("aria-live")).toBe("polite");
  });
});
