// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";
import { pointer as buildPointer, type PointerKind } from "@/test/pointer";

// Who owns the dialog's pull-to-close.
//
// A phone can have several fingers on the glass at once, and the gesture is
// one owner and a count of them. Before the owner was recorded, the second
// finger moved the first one's pull, ended it, and had its release measured
// against a start point it never set; while the count was a boolean, lifting
// one of three fingers re-armed the pull with two still pressing. Nothing
// about either needs a browser: it is which pointer each handler answers to
// and how many are down, so it is pinned here rather than in the e2e suite.
//
// Kept apart from animal-dialog.test.tsx on purpose: every gesture in this
// file needs pointer ids of its own, and that file's helper stamps them all 1.

// The dismiss gesture asks whether it is on the phone layout, and jsdom
// reports 1024px. The fan reads Tailwind's sm the same way and gets the phone
// geometry here, which is the layout the gesture belongs to.
const PHONE_LAYOUT = "(max-width: 639px)";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === PHONE_LAYOUT,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

// Far enough to close, from animal-dialog.tsx.
const DRAG_CLOSE_PX = 140;

// Ages are measured from the dataset's build time rather than the clock.
const REFERENCE = "2026-08-18T00:00:00.000Z";

const MURI: Animal = {
  id: "muri",
  source: {
    providerId: "test-shelter",
    sourceAnimalId: "muri",
    sourceUrl: "https://example.test/animals/muri",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  },
  shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
  name: "Muri",
  species: "cat",
  status: "available",
  images: [],
  attribution: "Foto: Zavetišče Test",
};

function renderDialog() {
  const onClose = vi.fn();
  const [client] = animalsForClient([MURI]);
  render(
    <I18nProvider locale="sl">
      <AnimalDialog
        animal={client}
        logos={{}}
        siblingIds={[]}
        reference={new Date(REFERENCE)}
        onNavigate={() => {}}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  const dialog = screen.getByRole("dialog");
  const body = dialog.querySelector('[data-slot="animal-dialog-body"]');
  if (!(body instanceof HTMLElement)) throw new Error("no dialog body");
  return { body, onClose };
}

// Every gesture in this file is about which finger is doing it, so the call
// sites below name the pointer and nothing else. The event itself is the
// shared builder's, which is where the jsdom workarounds live.
function pointer(
  element: HTMLElement,
  type: PointerKind,
  init: { id: number; x: number; y: number },
) {
  buildPointer(element, type, { x: init.x, y: init.y, pointerId: init.id });
}

// How far down the body has been pulled, read off the transform motion writes
// for the drag's motion value. No translateY at all is a body at rest.
function pull(body: HTMLElement): number {
  const found = /translateY\((-?[\d.]+)px\)/.exec(body.style.transform);
  return found ? Number(found[1]) : 0;
}

// The gesture starts at the top of the screen, where the pull is armed: the
// shell is at scrollTop 0, which jsdom reports for every element anyway.
const START = { x: 100, y: 80 };

describe("the dialog's pull-to-close", () => {
  it("closes on the owning finger's pull past the threshold", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX,
      });
      pointer(body, "pointermove", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
      pointer(body, "pointerup", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a second finger's travel and gives the pull back", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      // The first finger commits the gesture and the dialog follows it.
      pointer(body, "pointermove", { id: 1, x: START.x + 4, y: START.y + 100 });
    });
    expect(pull(body)).toBeGreaterThan(0);

    await act(async () => {
      // A second finger lands and travels far enough to close, on a start
      // point of its own that the dialog never took.
      pointer(body, "pointerdown", { id: 2, x: 300, y: 200 });
      pointer(body, "pointermove", { id: 2, x: 304, y: 200 + 400 });
    });

    // Two fingers are a pinch and neither is pulling the dialog anywhere, so
    // the pull springs back rather than following whoever moved last.
    await waitFor(() => expect(pull(body)).toBe(0));
    expect(onClose).not.toHaveBeenCalled();
  });

  // What a pinch on the photograph does to a gesture already in flight: the
  // browser rescales the visual viewport, and the first finger's own
  // coordinates come back rescaled with it. Chromium hands the page a jump of
  // several hundred pixels down the screen on a hand that only spread, which
  // read as a dismissal and closed the animal (pinned in the browser suite as
  // "a second finger neither turns a photo nor dismisses the animal").
  it("does not dismiss on the jump a pinch puts under the first finger", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", { id: 1, x: START.x + 4, y: START.y + 100 });
      // The second finger of the pinch.
      pointer(body, "pointerdown", { id: 2, x: 300, y: 200 });
      // And the first finger's coordinates, rescaled: it has not left the
      // photograph, the viewport moved under it.
      pointer(body, "pointermove", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 200,
      });
      pointer(body, "pointerup", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 200,
      });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("arms again once the glass is clear", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", { id: 1, x: START.x + 4, y: START.y + 100 });
      pointer(body, "pointerdown", { id: 2, x: 300, y: 200 });
      pointer(body, "pointerup", { id: 1, x: START.x + 4, y: START.y + 100 });
      pointer(body, "pointerup", { id: 2, x: 300, y: 200 });
    });
    expect(onClose).not.toHaveBeenCalled();

    // The hand that pinched is gone, and the next single finger gets the
    // gesture it has always had.
    await act(async () => {
      pointer(body, "pointerdown", { id: 3, ...START });
      pointer(body, "pointermove", {
        id: 3,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
      pointer(body, "pointerup", {
        id: 3,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A hand is not two fingers or nothing. With three down, one leaving still
  // leaves two on the glass, and the pull has to stay away until the last of
  // them lifts. A flag saying "a second finger arrived" got this wrong: any
  // release cleared it, so the finger that came down next was read as the
  // first of a fresh hand and could throw the animal away mid-pinch.
  it("does not re-arm while fingers are still down", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", { id: 1, x: START.x + 4, y: START.y + 100 });
      pointer(body, "pointerdown", { id: 2, x: 300, y: 200 });
      pointer(body, "pointerdown", { id: 3, x: 320, y: 240 });
      // One of the three leaves. Two are still pressing.
      pointer(body, "pointerup", { id: 2, x: 300, y: 200 });
    });
    // The pull the second finger took away is back where it started.
    await waitFor(() => expect(pull(body)).toBe(0));

    // A fourth finger lands on a glass that is not clear, and pulls far enough
    // to close if anything had armed for it.
    await act(async () => {
      pointer(body, "pointerdown", { id: 4, ...START });
      pointer(body, "pointermove", {
        id: 4,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });
    // Nothing is following it.
    expect(pull(body)).toBe(0);

    await act(async () => {
      pointer(body, "pointerup", {
        id: 4,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });
    expect(onClose).not.toHaveBeenCalled();

    // The rest of the hand goes, and the next press is a gesture again.
    await act(async () => {
      pointer(body, "pointerup", { id: 1, x: START.x + 4, y: START.y + 100 });
      pointer(body, "pointerup", { id: 3, x: 320, y: 240 });
    });

    await act(async () => {
      pointer(body, "pointerdown", { id: 5, ...START });
      pointer(body, "pointermove", {
        id: 5,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
      pointer(body, "pointerup", {
        id: 5,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not let a second finger's release end the first one's pull", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });
    const held = pull(body);
    expect(held).toBeGreaterThan(0);

    await act(async () => {
      // Past the threshold as the crow flies, and none of it this pointer's:
      // measured against the other finger's start it reads as a dismissal.
      pointer(body, "pointerup", {
        id: 2,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).not.toHaveBeenCalled();
    // Still down and still following the finger that owns it, rather than
    // snapped back by a release that was not its own.
    expect(pull(body)).toBe(held);

    await act(async () => {
      pointer(body, "pointerup", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a second finger's cancellation", async () => {
    const { body, onClose } = renderDialog();

    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
      pointer(body, "pointercancel", { id: 2, x: 304, y: 600 });
    });

    // The snap back a cancellation asks for belongs to the pointer that was
    // cancelled, so the pull is still live and still closes on its release.
    await act(async () => {
      pointer(body, "pointerup", {
        id: 1,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("takes a fresh gesture after the owner lets go", async () => {
    const { body, onClose } = renderDialog();

    // A short pull that springs back rather than closing, so the owner is
    // released without the dialog going anywhere.
    await act(async () => {
      pointer(body, "pointerdown", { id: 1, ...START });
      pointer(body, "pointermove", { id: 1, x: START.x + 4, y: START.y + 40 });
      pointer(body, "pointerup", { id: 1, x: START.x + 4, y: START.y + 40 });
    });
    expect(onClose).not.toHaveBeenCalled();

    // The next finger is a new gesture, whatever id the browser gives it.
    await act(async () => {
      pointer(body, "pointerdown", { id: 7, ...START });
      pointer(body, "pointermove", {
        id: 7,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
      pointer(body, "pointerup", {
        id: 7,
        x: START.x + 4,
        y: START.y + DRAG_CLOSE_PX + 80,
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
