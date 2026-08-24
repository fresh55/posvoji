// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(cleanup);

const NOW = new Date("2026-01-01T00:00:00.000Z");

// The frame the swipe measures against. jsdom lays nothing out, so
// clientWidth is 0 and the distance threshold would be `|dx| > 0.22` - every
// twitch a committed swipe. Stubbing it is what makes these tests about the
// heuristics rather than about jsdom.
const FRAME_WIDTH = 300;
const FAR = FRAME_WIDTH * 0.22;

function animal(rest: Partial<Animal> = {}): Animal {
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

// jsdom has no PointerEvent, and the Event it falls back to drops clientY and
// pointerType, so the gesture is built on MouseEvent by hand. React listens by
// event name, so the pointer handlers still receive these.
function pointer(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: { x: number; y: number; pointerType?: string; pointerId?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
  });
  Object.defineProperty(event, "pointerType", {
    value: init.pointerType ?? "touch",
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  fireEvent(element, event);
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

/** The visible "n / total" counter, which is what says where the gallery is. */
function counter() {
  return screen.getByText(/^\d+ \/ \d+$/).textContent;
}

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

  it("leaves the counter out of the way of the photo's own link", () => {
    setup();

    const badge = screen.getByText("1 / 3");
    expect(badge.className).toContain("pointer-events-none");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
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
    const live = document.querySelector(".sr-only");
    expect(live?.getAttribute("aria-live")).toBeNull();

    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));
    expect(document.querySelector(".sr-only")?.getAttribute("aria-live")).toBe(
      "polite",
    );
  });
});
