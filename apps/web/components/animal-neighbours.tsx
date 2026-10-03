import { ArrowRight } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalPhoto } from "@/components/animal-photo";
import { animalFields } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { permittedPhotos } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import {
  CARD_PHOTO_ASPECT,
  CARD_PHOTO_RADIUS,
  CARD_PHOTO_RATIO,
} from "@/lib/card-grid";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  animalMetaParts,
  META_DOT_CLASS,
  META_SEPARATOR,
} from "@/lib/labels";
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

// Four to a row inside the page's max-w-5xl from sm up, two on a phone. The
// box is square, so from sm the width asked for is 4/3 of the tile, for the
// reason CARD_PHOTO_SIZES gives; the phone band is the grid card's own.
const NEIGHBOUR_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px), (max-width: 1023px) 33vw, 304px";

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
  shelter,
  shelterCount,
  locale,
  reference,
}: {
  /** At least one; see shelterNeighbours in lib/animal-neighbours.ts. */
  neighbours: readonly Animal[];
  shelter: Animal["shelter"];
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
        <a href={shelterPath(shelter.id, locale)} className={WAY_ON_LINK}>
          {text.viewShelter(shelterCount)}
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </a>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {neighbours.map((neighbour) => {
          // The lead photo without its placeholder: the row is below the
          // fold, and four base64 blurs in this page's payload would be read
          // by nobody.
          const lead = permittedPhotos(neighbour.images)[0];
          const photo = lead && { ...lead, blurDataURL: undefined };
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
                <span
                  className={cn(
                    "relative block overflow-hidden bg-muted text-muted-foreground",
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
                      blur={false}
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
                    {animalMetaParts(fields, locale, reference).flatMap(
                      (part, index) =>
                        index === 0
                          ? [part]
                          : [
                              <span key={index} className={META_DOT_CLASS}>
                                {META_SEPARATOR}
                              </span>,
                              part,
                            ],
                    )}
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
