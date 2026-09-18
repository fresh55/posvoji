// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";
import { PHOTO_TRANSITION_NAME } from "@/lib/view-transition";
import { DESKTOP_FAN_QUERY, PHONE_SHELL_QUERY } from "./fan-layout";

// Closing is the opening played backwards: the front print goes back into the
// card's photo box, and the page comes back up under it. What is pinned here
// is which closes get that and which get the plain unmount, because the wrong
// answer is silent either way: a morph aimed at a card the browser has not
// laid out drops the photograph where it stands, and one aimed at a card
// scrolled away sends it off the edge of the screen.
//
// The pop the morph runs inside is jsdom's own. lib/location-search.test.ts
// holds the wrapper on its own; this is the end that arms it.

const MARK = "data-photo-morph";

// Copied from animal-dialog.test.tsx rather than shared, the way the other
// files beside it copy them: the dismiss gesture asks for the phone and the
// fan asks for the desktop, and every assertion here reads the desktop stage.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === PHONE_SHELL_QUERY || media === DESKTOP_FAN_QUERY,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.removeAttribute(MARK);
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

function photos(id: string, count: number): Animal["images"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
    cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
    width: 640,
    height: 480,
    widths: [320, 480, 640],
    blurDataURL: "data:image/webp;base64,UklGRg==",
    rights: "cache-permitted" as const,
  }));
}

function animal(id: string, name: string, rest: Partial<Animal> = {}): Animal {
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
    images: photos(id, 2),
    attribution: "Foto: Zavetišče Test",
    ...rest,
  };
}

const REX = animal("rex", "Rex");
// A cat, so a filtered link can leave it with no card in the grid behind the
// dialog: an animal this visitor's filters hide is still reachable by link.
const MICA = animal("mica", "Mica", { species: "cat" });

const REFERENCE = "2026-08-18T00:00:00.000Z";

function renderGrid(animals: Animal[] = [REX, MICA]) {
  return render(
    <I18nProvider locale="sl">
      <AnimalGrid
        animals={animalsForClient(animals)}
        logos={{}}
        referenceDate={REFERENCE}
      />
    </I18nProvider>,
  );
}

type Started = {
  /** The mark the stylesheet scopes the morph to, while the update ran. */
  mark: string | null;
  /** Whether the dialog was still in the document when the update began, and
   *  whether it was gone when it returned. The browser takes the new snapshot
   *  the moment the callback returns, so a dialog React has not let go of by
   *  then is a state the morph would have carried the photograph out of. */
  dialogBefore: boolean;
  dialogAfter: boolean;
  settle: () => void;
  skip: () => void;
};

/** Every transition the page starts, run in place: what is under test is what
 *  the update does and what is cleaned up afterwards, not the browser's
 *  schedule. */
function stubTransitions(): Started[] {
  const started: Started[] = [];
  document.startViewTransition = ((update: () => void) => {
    let settle = () => undefined as void;
    let skip = () => undefined as void;
    const finished = new Promise<void>((resolve, reject) => {
      settle = () => resolve();
      skip = () => reject(new Error("the browser skipped it"));
    });
    const dialogBefore = openDialog() !== null;
    update();
    started.push({
      mark: document.documentElement.getAttribute(MARK),
      dialogBefore,
      dialogAfter: openDialog() !== null,
      settle,
      skip,
    });
    return { finished, ready: finished, updateCallbackDone: finished };
  }) as typeof document.startViewTransition;
  return started;
}

function openDialog() {
  return document.querySelector<HTMLElement>('[data-slot="animal-dialog"]');
}

/** One animal's card in the grid, or null where the filters leave none.
 *
 *  Found by its heading rather than by role: the dialog's own title carries
 *  the same name, and an open dialog leaves the grid behind it aria-hidden, so
 *  a role query sees the wrong one of the two or neither. */
function card(name: string) {
  return (
    [...document.querySelectorAll("article h3")]
      .find((heading) => heading.textContent === name)
      ?.closest("article") ?? null
  );
}

/** The card's photo box, which is the box the morph aims at. */
function cardPhoto(name: string) {
  const found = card(name)?.querySelector<HTMLElement>(
    '[data-slot="photo-frame"]',
  );
  if (!found) throw new Error(`no photo box on ${name}'s card`);
  return found;
}

/** Where a card stands, which jsdom lays out nowhere: every box it measures is
 *  zero wide at the origin, and a box of no size is exactly what a card the
 *  browser has skipped reports (card-paint is content-visibility: auto). */
function place(element: HTMLElement, top: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 40,
    y: top,
    left: 40,
    right: 240,
    top,
    bottom: top + 200,
    width: 200,
    height: 200,
    toJSON: () => undefined,
  } as DOMRect);
}

function named(element: HTMLElement) {
  return element.style.getPropertyValue("view-transition-name");
}

async function openCard(name: string) {
  const link = card(name)?.querySelector('a[data-slot="card-link"]');
  if (!link) throw new Error(`no card link for ${name}`);
  await act(async () => {
    fireEvent.click(link);
  });
  return await screen.findByRole("dialog");
}

function closeButton(dialog: HTMLElement) {
  const found = dialog.querySelector<HTMLElement>(
    '[data-slot="dialog-close-card"]',
  );
  if (!found) throw new Error("no close button");
  return found;
}

describe("closing the animal dialog", () => {
  it("carries the front print back into the card the dialog is standing on", async () => {
    const started = stubTransitions();
    renderGrid();
    const dialog = await openCard("Rex");
    // The open's own morph, settled the way the browser settles it.
    expect(started).toHaveLength(1);
    started[0].settle();
    const photo = cardPhoto("Rex");
    place(photo, 120);
    const overlay = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]',
    );

    await act(async () => {
      fireEvent.click(closeButton(dialog));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The close ran as a morph of its own, inside the notification of the pop
    // it armed: the dialog was still there when the update began and gone when
    // it returned, which is the state the new snapshot is taken in.
    expect(started).toHaveLength(2);
    expect(started[1].mark).toBe("close");
    expect(started[1].dialogBefore).toBe(true);
    expect(started[1].dialogAfter).toBe(false);
    // The card's photo box is the box the photograph lands in.
    expect(named(photo)).toBe(PHOTO_TRANSITION_NAME);
    // Radix keeps a closing dialog until its own exit animation has ended, and
    // a synchronous flush cannot wait for one: both layers are told there is
    // nothing to wait for, so what carries them away is the root's crossfade.
    expect(dialog.style.animationName).toBe("none");
    expect(overlay?.style.animationName).toBe("none");

    started[1].settle();
    await waitFor(() => expect(named(photo)).toBe(""));
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
  });

  it("clears the name and the mark when the browser skips the close", async () => {
    const started = stubTransitions();
    renderGrid();
    const dialog = await openCard("Rex");
    started[0].settle();
    const photo = cardPhoto("Rex");
    place(photo, 120);

    await act(async () => {
      fireEvent.click(closeButton(dialog));
    });
    await waitFor(() => expect(started).toHaveLength(2));

    started[1].skip();

    // The name and the mark have to come off either way, or the next morph is
    // skipped too.
    await waitFor(() => expect(named(photo)).toBe(""));
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
  });

  it("closes plainly when the card behind is scrolled off the screen", async () => {
    const started = stubTransitions();
    renderGrid();
    const dialog = await openCard("Rex");
    started[0].settle();
    // Above the viewport, which after a step through the list is where the
    // card behind the dialog usually is. A morph aimed there sends the
    // photograph off the top of the screen.
    place(cardPhoto("Rex"), -600);

    await act(async () => {
      fireEvent.click(closeButton(dialog));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(started).toHaveLength(1);
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
  });

  it("closes plainly when the browser has not laid the card out", async () => {
    const started = stubTransitions();
    renderGrid();
    const dialog = await openCard("Rex");
    started[0].settle();
    // Grid cards carry card-paint, so a card scrolled far away is skipped and
    // has no box at all. jsdom reports exactly that on its own, which is what
    // this leaves unstubbed.

    await act(async () => {
      fireEvent.click(closeButton(dialog));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(started).toHaveLength(1);
  });

  it("closes plainly when no card stands behind the dialog", async () => {
    const started = stubTransitions();
    // A filtered link to an animal the filter hides: the dialog opens on it,
    // and the grid behind holds no card of its own to go back to.
    window.history.replaceState(null, "", "/?vrsta=pes&zival=mica");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    expect(card("Mica")).toBeNull();

    await act(async () => {
      fireEvent.click(closeButton(dialog));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(started).toHaveLength(0);
  });
});
