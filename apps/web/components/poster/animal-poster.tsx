import { Fragment } from "react";
import type { Animal } from "@posvoji/schema";
import { QrCode } from "@/components/poster/qr-code";
import type { AnimalFields } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { posterPhoto } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { getMessages, translate, type Locale } from "@/lib/i18n";
import {
  ageLabel,
  animalMetaParts,
  longStayMonths,
  META_SEPARATOR,
  monthsInShelter,
  registerDateLabel,
} from "@/lib/labels";
import type { ShelterLogos } from "@/lib/shelter-logos";
import type { ShelterPhones } from "@/lib/shelters";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./poster.css";

/**
 * One animal on one sheet of A4, for a vet's waiting room or a notice board.
 *
 * A server component, and it has to stay one: the QR code beside it is
 * encoded during the export, and every fact on the sheet is read from the
 * dataset the build already has open. Nothing here is interactive, because
 * paper is not.
 *
 * The sheet says the name, shows the animal, names the shelter and carries
 * the code. It says nothing else. A poster that explains itself is a poster
 * nobody reads across a room.
 */

const posterText = {
  sl: {
    /** The tail of the share sheet's "{name} išče dom" (share-button.tsx).
     *  The name is lifted out of it to be the headline, so the two lines read
     *  top to bottom as that same sentence and the name gets the size it
     *  needs to work across a room. */
    seeking: "išče dom",
    /** The site's own standing line, from messages.footer, and not a second
     *  sentence written for a poster. Where an adoption happens is the one
     *  thing a stranger reading this off a wall has to be told. */
    adoption: "Posvojitev vedno poteka pri zavetišču.",
    asOf: (date: string) => `stanje ${date}`,
    qrLabel: (name: string) => `QR koda za stran živali ${name}`,
  },
  en: {
    seeking: "is looking for a home",
    adoption: "Adoptions always go through the shelter.",
    asOf: (date: string) => `as of ${date}`,
    qrLabel: (name: string) => `QR code for ${name}'s page`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

/**
 * The card's own fact line, in both of the two shapes it takes.
 *
 * A card has room for two facts at 375px and picks which two: the "Vse" tab
 * says the species and the age, a species tab already said the species and
 * says the age and the size instead. A sheet of A4 has room for all three and
 * no reason to choose, and they are the same facts either way, so both shapes
 * are asked for and folded together. animalMetaParts stays the one place that
 * decides how each of them is worded and which are known at all.
 */
function metaParts(
  animal: AnimalFields,
  locale: Locale,
  reference: Date,
): string[] {
  // The narrowing is what picks the second shape: only a tab that names one
  // species drops the species word and says the size instead, and those are
  // the two the SpeciesFilter union has.
  const sized =
    animal.species === "dog" || animal.species === "cat"
      ? animalMetaParts(animal, locale, reference, animal.species)
      : [];
  return [
    ...new Set([...animalMetaParts(animal, locale, reference), ...sized]),
  ];
}

/** The wait, or nothing. The plea and the quiet aside are the dialog's own
 *  two voices for it, and which one an animal gets is labels.ts's call rather
 *  than this sheet's: see shelter-block.tsx and animal-facts.tsx. */
function waitLine(
  animal: AnimalFields,
  locale: Locale,
  reference: Date,
  name: string,
): { text: string; plea: boolean } | undefined {
  const long = longStayMonths(animal, reference);
  if (long !== undefined) {
    const duration = ageLabel(long, locale);
    return {
      text: animal.name
        ? translate(locale, "longStay", { name, duration })
        : translate(locale, "longStayUnnamed", { duration }),
      plea: true,
    };
  }
  // An adopted animal has left, so its stay is history and stays off the
  // sheet. It has no business on a poster at all, but a dataset can be a day
  // behind a shelter's own listing.
  if (!animal.intakeDate || animal.status === "adopted") return undefined;
  const months = monthsInShelter(animal.intakeDate, reference);
  if (months === undefined) return undefined;
  return {
    text: `${getMessages(locale).factTimeInShelter}: ${ageLabel(months, locale)}`,
    plea: false,
  };
}

export function AnimalPoster({
  animal,
  locale,
  generatedAt,
  logos,
  phones,
}: {
  animal: Animal;
  locale: Locale;
  /** The dataset's own build time. The sheet prints its date, because paper
   *  hangs for weeks and the code beside it is the live truth. */
  generatedAt: string;
  logos: ShelterLogos;
  phones: ShelterPhones;
}) {
  const messages = getMessages(locale);
  const text = posterText[locale];
  const reference = new Date(generatedAt);
  const name = animal.name ?? messages.unnamed;

  // Our own cached copy or nothing at all. A hotlinked photo is the shelter's
  // file on the shelter's server, and permission to show it in a browser is
  // not permission to print it. See posterPhoto in lib/animal-images.ts.
  const photo = posterPhoto(animal.images);
  const SpeciesMark = SPECIES_ICONS[animal.species];

  const meta = metaParts(animal, locale, reference);
  const wait = waitLine(animal, locale, reference, name);

  const logo = logos[animal.shelter.id];
  const phone = phones[animal.shelter.id];

  const path = animalPath(animal, locale);
  const url = `${SITE_URL}${path}`;
  // The same address in letters, for someone with no phone in their hand.
  const printedUrl = `${SITE_URL.replace(/^https?:\/\//, "")}${path}`;

  return (
    <div className="poster-sheet">
      {photo ? (
        <div className="poster-photo">
          {/* The share cards' recipe: the photo blown up and blurred to fill
              the frame, the whole uncropped photo on top. A portrait shelter
              photo keeps its face and its paws where a cover crop would cut
              through them.
              The rule asks for next/image, which under images.unoptimized
              emits a bare <img> anyway. Print wants the largest file and no
              srcset at all, so the tag is written out here.  */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt="" aria-hidden className="poster-photo-fill" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt={name} className="poster-photo-image" />
        </div>
      ) : (
        // No photo to print, so the species stands in for the animal at the
        // size the photo would have been. A mark and not a sentence: "brez
        // fotografije" would be the largest thing on the sheet and would be
        // about us rather than about the animal.
        <div className="poster-mark" aria-hidden>
          <SpeciesMark strokeWidth={0.6} />
        </div>
      )}

      <h1 className="poster-headline">{name}</h1>
      <p className="poster-seeking">{text.seeking}</p>

      {meta.length > 0 && (
        <p className="poster-meta">{meta.join(META_SEPARATOR)}</p>
      )}

      {wait && (
        <p className={wait.plea ? "poster-wait" : "poster-stay"}>{wait.text}</p>
      )}

      <div className="poster-spacer" />

      <div className="poster-foot">
        <div className="poster-shelter">
          {logo && (
            <span
              className={cn(
                "poster-shelter-mark",
                logo.chipOnLight && !logo.opaque && "poster-shelter-mark--chip",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.url}
                alt=""
                width={logo.width}
                height={logo.height}
                className={cn(
                  "poster-shelter-logo",
                  logo.opaque && "poster-shelter-logo--opaque",
                )}
              />
            </span>
          )}
          <p className="poster-shelter-name">{animal.shelter.name}</p>
          <p className="poster-shelter-line">
            {phone
              ? `${animal.shelter.city}${META_SEPARATOR}${phone}`
              : animal.shelter.city}
          </p>
          <p className="poster-shelter-note">{text.adoption}</p>
        </div>

        <div className="poster-qr">
          <QrCode value={url} label={text.qrLabel(name)} />
          {/* A break opportunity after each separator, so the address wraps
              where a reader would expect it to. Without them the only rule in
              play is overflow-wrap: anywhere, which is the fallback for a
              segment too long for the column, and it cut the id in half
              ("nina-" / "6fac27"), which is the one part of the address
              somebody typing it out cannot guess. */}
          <p className="poster-url">
            {printedUrl.split("/").map((segment, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {segment}
              </Fragment>
            ))}
          </p>
        </div>
      </div>

      <p className="poster-colophon">
        <span className="poster-wordmark">posvoji.si</span>
        <span>{text.asOf(registerDateLabel(generatedAt, locale))}</span>
      </p>
    </div>
  );
}
