"use client";

import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";
import type { ClientAnimal } from "@/lib/animal";
import type { PermittedPhoto } from "@/lib/animal-images";
import { CARD_GRID } from "@/lib/card-grid";

// Every shape a grid card can take, side by side, so a change to the card can
// be seen in one glance and caught by one snapshot. Dev-only: page.tsx renders
// the 404 in a production build, and the build then removes the exported /dev
// tree (scripts/drop-dev-output.mjs, which drops out/dev whole rather than by
// route name, so this route needed no change there).
//
// Its own client file because AnimalCard takes an onOpen handler, which a
// server component cannot hand it. That leaves page.tsx a server component,
// which is where the production branch belongs. The same split the map
// gallery next door makes, for the same reason.
//
// Fixture-free, like the map gallery, and for the same reason: CI runs
// `pnpm test:visual` with no data/dist and no /media, so anything this drew
// from the dataset would make the one suite that has no dataset need one. The
// photos below are inline SVG data URIs, so the cards paint from the document
// itself and no request leaves the page.

/** The dataset's build time in the real grid, and a fixed date here so the
 *  ages and the wait below are the same string in every run. */
const REFERENCE = new Date("2026-01-01T00:00:00.000Z");

/**
 * One photo as a flat coloured plate with the animal's name on it.
 *
 * A `data:` URI and not a file: `widths` is left off, so photoSrcSet returns
 * nothing (it wants a cached /media copy with at least two rungs) and the
 * <img> carries a single src with no srcset. `blurDataURL` is left off too,
 * which keeps AnimalPhoto's placeholder div out of the tree: a blur that
 * paints and is then covered is exactly the kind of two-state paint a
 * screenshot catches on one run and not the next.
 *
 * Sized 480x360 rather than left to the viewBox, so the SVG has an intrinsic
 * size and naturalWidth answers something above zero, which is what the spec
 * waits on.
 */
function plate(label: string, background: string, ink: string): PermittedPhoto {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">` +
    `<rect width="480" height="360" fill="${background}"/>` +
    `<text x="240" y="180" fill="${ink}" font-family="sans-serif" font-size="28"` +
    ` font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}

/** A run of plates for one animal, each a different colour, so the gallery's
 *  position dots have something to point at. */
function plates(
  name: string,
  count: number,
  colours: readonly string[],
  ink: string,
): PermittedPhoto[] {
  return Array.from({ length: count }, (_, i) =>
    plate(
      count > 1 ? `${name} ${i + 1}` : name,
      colours[i % colours.length]!,
      ink,
    ),
  );
}

/** The fields every fixture shares, so each entry below states only what it is
 *  there to show. Written as the projection a card is handed on the page
 *  (ClientAnimal: photos already resolved, no rights left to read), and not as
 *  a dataset Animal put through animalsForClient, because that helper lives in
 *  lib/dataset.ts beside the loader and this page must not pull a dataset in. */
function animal(rest: Partial<ClientAnimal> & { id: string }): ClientAnimal {
  return {
    source: { sourceUrl: `https://example.test/animals/${rest.id}` },
    shelter: {
      id: "zavetisce-ljubljana",
      name: "Zavetišče Ljubljana",
      city: "Ljubljana",
    },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Foto: Zavetišče Ljubljana",
    ...rest,
  };
}

const DARK_INK = "#1b2b20";
const LIGHT_INK = "#f7faf8";

// Eight cards, one per thing the card has to get right. The roster is the
// point of this page: a card that only ever renders the common case is a card
// whose corners, badges, clamping and truncation nobody is watching.
const ANIMALS: ClientAnimal[] = [
  // The common case, and the one the other seven are read against.
  animal({
    id: "muri",
    name: "Muri",
    birthDate: "2024-01-01",
    images: plates("Muri", 1, ["#c8e0cf"], DARK_INK),
  }),
  // Five photos, which is exactly MAX_PHOTO_DOTS: the dot row at its full
  // width, with the first dot active.
  animal({
    id: "rex",
    name: "Rex",
    species: "dog",
    size: "medium",
    birthDate: "2022-01-01",
    images: plates(
      "Rex",
      5,
      ["#b9d4e6", "#a8c8de", "#97bcd6", "#86b0ce", "#75a4c6"],
      DARK_INK,
    ),
  }),
  // A name that fills the h3's two clamped lines. Three of the register's 503
  // names run this long, and they are the reason line-clamp-2 is there.
  animal({
    id: "marmeladka",
    name: "Gospodična Marmeladka Sončica",
    birthDate: "2023-06-01",
    images: plates("Marmeladka", 1, ["#edd6bd"], DARK_INK),
  }),
  // The warm badge, top left on the photo, and a second photo so the dots and
  // the badge are seen sharing the frame.
  animal({
    id: "luna",
    name: "Luna",
    status: "reserved",
    birthDate: "2023-01-01",
    images: plates("Luna", 2, ["#d9c4e0", "#c9b0d4"], DARK_INK),
  }),
  // The quiet pair: the badge goes grey and QUIET_PHOTO takes a fifth of the
  // light and two fifths of the colour off the picture under it.
  animal({
    id: "piki",
    name: "Piki",
    species: "dog",
    status: "adopted",
    birthDate: "2020-01-01",
    images: plates("Piki", 1, ["#8aa6b8"], LIGHT_INK),
  }),
  // Past LONG_STAY_MONTHS, so the quiet overlay pill sits top right, opposite
  // where the status badge would be. 55 months at REFERENCE.
  animal({
    id: "sivko",
    name: "Sivko",
    intakeDate: "2021-06-01",
    birthDate: "2019-06-01",
    images: plates("Sivko", 1, ["#cfd8d2"], DARK_INK),
  }),
  // No photo at all, which is the frame's own ground and the "photo at the
  // shelter" note, with no dots and no chevrons.
  animal({
    id: "zvezdica",
    name: "Zvezdica",
    species: "rabbit",
    birthDate: "2025-01-01",
    images: [],
  }),
  // A shelter name long enough to truncate after shelterChipLabel has taken
  // the noun and the operator parenthetical off it. Three of the seventeen
  // registered names do not fit a card on their own.
  animal({
    id: "pika",
    name: "Pika",
    species: "dog",
    birthDate: "2021-03-01",
    shelter: {
      id: "zavetisce-gorenjska",
      name: "Zavetišče za zapuščene živali Gorenjske in Notranjske (Občina Kranj)",
      city: "Kranj",
    },
    attribution: "Foto: Zavetišče za zapuščene živali Gorenjske in Notranjske",
    images: plates("Pika", 1, ["#e3cdcd"], DARK_INK),
  }),
];

function CardRow() {
  return (
    // The page's own shell around the real CARD_GRID, so the columns fall
    // where they fall on the site rather than wherever a bare full-width grid
    // would put them: max-w-7xl and px-gutter are what every page centres its
    // content with, and CARD_PHOTO_SIZES is derived from exactly that pair.
    <div className="mx-auto w-full max-w-7xl px-gutter">
      <div className={CARD_GRID}>
        {ANIMALS.map((subject) => (
          <AnimalCard
            key={subject.id}
            animal={subject}
            reference={REFERENCE}
            onOpen={() => undefined}
            showShelter
            // Every card, not just the first row. The real grid marks four,
            // because there the rest are below the fold and lazy is right.
            // Here the snapshot waits for every photo to have decoded, and a
            // lazy photo under the fold never starts loading until something
            // scrolls it into view. Only the loading and fetchPriority
            // attributes change; nothing about the drawing does.
            eager
          />
        ))}
      </div>
    </div>
  );
}

// No card-paint and no entrance stagger, which the real grid adds around these
// same cards. content-visibility: auto skips painting what is off screen, and
// the stagger is an animation: both are about a grid of five hundred arriving
// at once, neither is part of the card, and both would put a screenshot's
// result in the hands of where the scroll happened to be.
export function CardGallery() {
  return (
    <I18nProvider locale="sl">
      <main data-card-gallery className="bg-background text-foreground">
        {/* The light section carries no theme class, and cannot: globals.css
            swaps to the dark tokens under
            `@media (prefers-color-scheme: dark)` behind a `:root:not(.light)`
            guard, read on the root element only. The `light` that pins this
            page therefore sits on <html> in app/dev/layout.tsx. The dark
            section is asymmetric on purpose: the `dark` variant matches
            `.dark *` and the `.dark` token block is plain CSS, so both work on
            any element. */}
        <section
          data-card-gallery-theme="light"
          className="bg-background text-foreground pb-10"
        >
          <h1 className="px-gutter pt-8 pb-4 text-lg font-semibold">
            Card grid, light
          </h1>
          <CardRow />
        </section>

        <section
          data-card-gallery-theme="dark"
          className="dark bg-background text-foreground pb-10"
        >
          <h1 className="px-gutter pt-8 pb-4 text-lg font-semibold">
            Card grid, dark
          </h1>
          <CardRow />
        </section>
      </main>
    </I18nProvider>
  );
}
