import { ArrowRight } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalPhoto } from "@/components/animal-photo";
import { MetaParts } from "@/components/meta-parts";
import { animalFields } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { permittedPhotos, type PermittedPhoto } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import {
  CARD_PHOTO_ASPECT,
  CARD_PHOTO_RADIUS,
  CARD_PHOTO_RATIO,
} from "@/lib/card-grid";
import { getMessages, type Locale } from "@/lib/i18n";
import { animalMetaParts } from "@/lib/labels";
import { SECTION_TITLE, WAY_ON_LINK } from "@/lib/link-styles";
import { shelterPath } from "@/lib/shelter-path";
import { cn } from "@/lib/utils";

const neighbourText = {
  sl: {
    title: "Še iz tega zavetišča",
    viewShelter: (count: number) => `Vse živali zavetišča (${count})`,
  },
  en: {
    title: "More from this shelter",
    viewShelter: (count: number) => `All the shelter's animals (${count})`,
  },
} satisfies Record<Locale, Record<string, string | ((count: number) => string)>>;

// How wide a tile draws: two to a row on a phone, four inside the page's
// 1024px frame from sm up, where a tile is at most 244px. From sm the sizes
// state 4/3 of that, 325px, because a square box over a wider photo needs a
// file that wide; see CARD_PHOTO_SIZES.
const NEIGHBOUR_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px), (max-width: 1023px) 33vw, 325px";

/** The photo with its placeholder left behind: AnimalPhoto would draw it, and
 *  the page would carry it as base64 for a row below the fold. A key set to
 *  undefined would still be written out, so it is removed, not blanked. */
function withoutBlur(photo: PermittedPhoto): PermittedPhoto {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
  const { blurDataURL, ...rest } = photo;
  return rest;
}

/**
 * Other animals at the same shelter, under the animal a shared link opened.
 *
 * The dialog has steps to the animals either side of the one it shows. This
 * page had none: a visitor who arrived from a link, and who knows the site
 * least, saw one animal and a single line back to the list. If this animal is
 * not the one, the row is where they go next.
 *
 * Plain links to each animal's own page, and no dialog: the page holds one
 * animal, and the grid's cards bring the dialog, its host and every animal's
 * projection with them. The tile is the card's picture, name and fact line
 * without the rest.
 *
 * The caller draws this only where there is at least one neighbour.
 */
export function AnimalNeighbours({
  neighbours,
  shelterId,
  shelterCount,
  locale,
  reference,
}: {
  /** At least one; see shelterNeighbours in lib/animal-neighbours.ts. */
  neighbours: readonly Animal[];
  shelterId: string;
  /** Every animal the shelter's own page lists, this one included. */
  shelterCount: number;
  locale: Locale;
  /** The dataset's own build time, so the ages agree with the cards. */
  reference: Date;
}) {
  const messages = getMessages(locale);
  const text = neighbourText[locale];
  return (
    <section
      aria-labelledby="animal-neighbours"
      data-slot="animal-neighbours"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3">
        <h2 id="animal-neighbours" className={SECTION_TITLE}>
          {text.title}
        </h2>
        <a href={shelterPath(shelterId, locale)} className={WAY_ON_LINK}>
          {text.viewShelter(shelterCount)}
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </a>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {neighbours.map((neighbour) => {
          const lead = permittedPhotos(neighbour.images)[0];
          const photo = lead && withoutBlur(lead);
          const SpeciesMark = SPECIES_ICONS[neighbour.species];
          const fields = animalFields(neighbour);
          return (
            <li key={neighbour.id} className="min-w-0">
              <a
                href={animalPath(fields, locale)}
                className={cn(
                  "group flex flex-col gap-2 outline-none",
                  CARD_PHOTO_RADIUS,
                  "focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
                )}
              >
                {/* The card's frame, with its hairline: studio photos on a
                    white ground need the edge to keep their corners
                    (PHOTO_FRAME in animal-card.tsx). */}
                <span
                  className={cn(
                    "relative block overflow-hidden bg-muted text-muted-foreground",
                    "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:shadow-[inset_0_0_0_1px_var(--card-photo-edge)]",
                    CARD_PHOTO_ASPECT,
                    CARD_PHOTO_RADIUS,
                  )}
                >
                  {photo ? (
                    <AnimalPhoto
                      photo={photo}
                      alt=""
                      sizes={NEIGHBOUR_PHOTO_SIZES}
                      frame={CARD_PHOTO_RATIO}
                      className="object-cover"
                    />
                  ) : (
                    <SpeciesMark
                      className="absolute inset-0 m-auto size-10"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="block min-w-0">
                  <span className="line-clamp-2 font-semibold underline-offset-4 group-hover:underline">
                    {neighbour.name ?? messages.unnamed}
                  </span>
                  <span className="block text-pretty text-sm tabular-nums">
                    <MetaParts
                      parts={animalMetaParts(fields, locale, reference)}
                    />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
