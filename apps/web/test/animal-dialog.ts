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
import { vi } from "vitest";

/** The dataset's build time, which the dialog measures its freshness line
 *  against. A fixed instant, so nothing here is written against the clock. */
export const REFERENCE = "2026-08-18T00:00:00.000Z";

/**
 * One animal with `count` cached photographs.
 *
 * Cached rather than display-permitted, because that is what the fan draws
 * from: a ladder to pick a rung off and a placeholder to paint while the file
 * is on its way.
 */
export function animal(id: string, name: string, count = 1): Animal {
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
      blurDataURL: "data:image/webp;base64,UklGRg==",
      rights: "cache-permitted" as const,
    })),
    attribution: "Foto: Zavetišče Test",
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
