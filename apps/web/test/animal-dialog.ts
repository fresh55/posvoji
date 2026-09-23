/**
 * The fixtures the animal dialog's suites are built on: one animal in the
 * shape ingest delivers, the dataset's build time, and the matchMedia the
 * dialog asks which layout it is standing in.
 *
 * Three suites carried their own copy of the builder below and they had
 * already drifted, which is how `test/pointer.ts` and `test/location.ts`
 * started too. The shape matters: it is what ingest writes, cached copies with
 * their `widths` ladder and a blur placeholder, and a suite exercising a
 * different one is a suite exercising a page the site does not serve.
 *
 * Not a `.test.` file, so vitest does not collect it.
 */

import type { Animal } from "@posvoji/schema";
import { act } from "@testing-library/react";
import { vi } from "vitest";
// The dialog's chunk, loaded with this module so a suite collects it rather
// than paying for it inside the first test that waits in dialogOnPage below.
// Under the full suite that load took seconds of a five-second test.
import "@/components/animal-dialog/animal-dialog";

/** The dataset's build time, which the dialog measures its freshness line
 *  against. A fixed instant, so nothing here is written against the clock. */
export const REFERENCE = "2026-08-18T00:00:00.000Z";

/**
 * One animal with `count` cached photographs.
 *
 * Cached rather than display-permitted, because that is what the fan draws
 * from: a ladder to pick a rung off, an AVIF sibling for the first photo and a
 * placeholder to paint while the file is on its way. Anything less leaves a
 * suite exercising the fallback path while the site runs the other one.
 *
 * `rest` is whatever this animal differs in: a species the visitor's filters
 * hide, a status that is over, a date. It is written over the record, so a
 * suite can replace the images too.
 */
export function animal(
  id: string,
  name: string,
  count = 1,
  rest: Partial<Animal> = {},
): Animal {
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
    images: Array.from({ length: count }, (_, index) => ({
      sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
      cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
      width: 640,
      height: 480,
      widths: [320, 480, 640],
      ...(index === 0 ? { avif: true } : {}),
      blurDataURL: "data:image/webp;base64,UklGRg==",
      rights: "cache-permitted" as const,
    })),
    attribution: "Foto: Zavetišče Test",
    ...rest,
  };
}

/**
 * The matchMedia jsdom does not ship.
 *
 * The fan reads the viewport to pick which geometry to mount and MotionConfig
 * reads it again to resolve reducedMotion="user", so a suite that stubs
 * nothing renders neither. `answers` says which queries match: a suite that
 * wants the desktop fan answers the fan's own query, and one that does not
 * care leaves it saying no to everything.
 */
export function stubMatchMedia(
  answers: (media: string) => boolean = () => false,
) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: answers(media),
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

/**
 * Waits for the grid's idle mount of the dialog, and for the lazy chunk it
 * asks for.
 *
 * A press before that carries no photograph (animal-card.tsx), so a test about
 * the morph has to be the press a visitor makes rather than one that beats the
 * page to it. Importing the module here is what the grid's own lazy import
 * resolves to, so the wait is a task rather than however long the loader takes,
 * and idle is a task too (stubIdleCallback in test/grid-stubs.ts).
 *
 * Three ticks because the chain is longer than one commit: the idle callback
 * mounts the dialog, the lazy boundary commits it, and the readiness it
 * reports lands in the grid after that.
 */
export async function dialogOnPage() {
  await import("@/components/animal-dialog/animal-dialog");
  for (let tick = 0; tick < 3; tick++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
