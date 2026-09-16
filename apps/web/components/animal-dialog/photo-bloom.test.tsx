// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";

// The copy of the card's photograph on its way into the fan, and what the fan
// is told while it is in the air.
//
// The fan is stood in for here rather than mounted: what this file is about is
// the seam between the two. The copy has to be in the document before the fan
// is first painted, the front print has to be held back for as long as the copy
// is flying and no longer, and it has to come back whether or not the copy ever
// says it landed.

// What the fan is handed, one entry per render, and whether the stand-in offers
// a slot to aim at. jsdom measures everything as zero, so the slot carries a
// rectangle of its own.
const fan = vi.hoisted(() => ({
  hold: [] as (boolean | undefined)[],
  slot: true,
  rect: { left: 420, top: 280, width: 320, height: 240 },
}));

// Whether the bloom is replaced by a stand-in that reports nothing, which is
// the starved frame loop the dialog's timer is there for.
const bloom = vi.hoisted(() => ({ silent: false }));

// motion's own useReducedMotion reads matchMedia through a module-level value
// that latches on first use, so a preference set between tests in one file
// would come too late. Asked as a question this file can answer instead.
const prefers = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => prefers.reduced };
});

vi.mock("@/components/animal-dialog/photo-spread", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/animal-dialog/photo-spread")
    >();
  return {
    ...actual,
    PhotoSpread(props: ComponentProps<typeof actual.PhotoSpread>) {
      fan.hold.push(props.holdFrontPrint);
      return (
        <div data-slot="photo-spread">
          {fan.slot && <button type="button" aria-pressed="true" />}
        </div>
      );
    },
  };
});

vi.mock("@/components/animal-dialog/photo-bloom", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/animal-dialog/photo-bloom")
    >();
  return {
    ...actual,
    PhotoBloom(props: ComponentProps<typeof actual.PhotoBloom>) {
      if (bloom.silent) return null;
      return <actual.PhotoBloom {...props} />;
    },
  };
});

// jsdom measures every element as zero, and a slot with no width is a slot the
// copy will not set off towards. The stand-in's print is given the rectangle
// the fan's own would have, on the prototype rather than on the element: the
// bloom reads the slot in a layout effect, and a ref is not attached to the
// element by the time that runs.
const ZERO_RECT = new DOMRect(0, 0, 0, 0);

Element.prototype.getBoundingClientRect = function slotOrNothing(
  this: Element,
) {
  return this.matches('[data-slot="photo-spread"] button[aria-pressed="true"]')
    ? new DOMRect(fan.rect.left, fan.rect.top, fan.rect.width, fan.rect.height)
    : ZERO_RECT;
};

// jsdom ships no matchMedia, and the dialog asks which layout it is standing
// in. Nothing in this file depends on the answer.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

beforeEach(() => {
  fan.hold = [];
  fan.slot = true;
  bloom.silent = false;
  prefers.reduced = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const REFERENCE = "2026-08-18T00:00:00.000Z";

// The card the dialog was opened from, as the grid measured it.
const ORIGIN = {
  x: 240,
  y: 360,
  photo: { left: 160, top: 240, width: 260, height: 195 },
};

function animal(id: string, name: string): Animal {
  return {
    id,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
    name,
    species: "dog",
    status: "available",
    images: [
      {
        sourceUrl: `https://example.test/${id}-1.jpg`,
        cachedUrl: `/media/animals/${id}-1.webp`,
        width: 640,
        height: 480,
        widths: [320, 480, 640],
        blurDataURL: "data:image/webp;base64,UklGRg==",
        rights: "cache-permitted" as const,
      },
    ],
    attribution: "Foto: Zavetišče Test",
  };
}

const REX = animal("rex", "Rex");
const MURI = animal("muri", "Muri");

function dialogFor(subject: Animal, origin?: typeof ORIGIN) {
  const [client] = animalsForClient([subject]);
  return (
    <I18nProvider locale="sl">
      <AnimalDialog
        animal={client}
        logos={{}}
        origin={origin}
        siblingIds={[]}
        reference={new Date(REFERENCE)}
        onNavigate={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>
  );
}

/** The copy in flight, which is in the document only while it is flying. */
function copy() {
  return document.querySelector('[data-slot="photo-bloom"]');
}

/** What the fan was last told about the front print. */
function held() {
  return fan.hold.at(-1);
}

describe("the bloom and the fan's front print", () => {
  it("places the copy before the frame after the fan's own commit", () => {
    // No frame is ever served, so anything the copy waited a frame for is not
    // going to happen: the slot has to have been measured in the commit the fan
    // was put in the document in.
    vi.stubGlobal("requestAnimationFrame", () => 1);

    render(dialogFor(REX, ORIGIN));

    expect(copy()).not.toBeNull();
    expect(held()).toBe(true);
  });

  it("holds the front print until the copy has landed", async () => {
    render(dialogFor(REX, ORIGIN));

    expect(copy()).not.toBeNull();
    expect(fan.hold[0]).toBe(true);

    // The copy leaving the document is the landing itself, so the two together
    // are the whole trip: the print is let in when, and not before, the copy
    // has stopped being drawn.
    await waitFor(() => expect(copy()).toBeNull(), { timeout: 2000 });
    expect(held()).toBe(false);
  });

  it("carries nothing and holds nothing for a link with no card behind it", () => {
    render(dialogFor(REX));

    expect(copy()).toBeNull();
    expect(fan.hold.every((hold) => hold === false)).toBe(true);
  });

  it("lets the print in when there is no slot to aim at", async () => {
    fan.slot = false;

    render(dialogFor(REX, ORIGIN));

    expect(copy()).toBeNull();
    await waitFor(() => expect(held()).toBe(false));
  });

  it("clears the hold on its own timer when the copy never reports", () => {
    // A copy that says nothing, which is what a starved frame loop leaves
    // behind: the animation never completes, so the landing is never reported.
    bloom.silent = true;
    // Only the timers, so motion keeps the real clock and the real frames.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    render(dialogFor(REX, ORIGIN));
    expect(held()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(held()).toBe(false);
  });

  it("never holds the print when motion is turned down", () => {
    prefers.reduced = true;

    render(dialogFor(REX, ORIGIN));

    expect(copy()).toBeNull();
    expect(fan.hold.every((hold) => hold === false)).toBe(true);
  });

  it("does not hold the next animal's print on a step", async () => {
    const view = render(dialogFor(REX, ORIGIN));
    expect(held()).toBe(true);

    // The arrows keep the origin they opened with, because the card the next
    // animal would fly from is behind the dialog and was never measured. The
    // bloom belongs to the animal the dialog opened on and to no other, so the
    // print of the animal stepped to waits for nothing, whatever the copy
    // behind it is still finishing.
    await act(async () => {
      view.rerender(dialogFor(MURI, ORIGIN));
    });

    expect(held()).toBe(false);
  });
});
