import { Fragment } from "react";
import type { Animal } from "@posvoji/schema";
import { PosterFacts, posterTiles } from "@/components/poster/poster-facts";
import { QrCode } from "@/components/poster/qr-code";
import type { AnimalFields } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { posterPhoto } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { brandMarkPaths, BRAND_MARK_VIEWBOX } from "@/lib/brand-mark";
import { getMessages, translate, type Locale } from "@/lib/i18n";
import {
  ageLabel,
  longStayMonths,
  registerDateLabel,
  statusLabel,
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
 * encoded during the export, the site's own mark is read off disk, and every
 * fact on the sheet comes from the dataset the build already has open.
 * Nothing here is interactive, because paper is not.
 *
 * The sheet says the name, shows the animal, states what the shelter recorded
 * about it, names the shelter and carries the code. It says nothing else. A
 * poster that explains itself is a poster nobody reads across a room.
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
 * How large the name is set, from how long it is.
 *
 * Counted at build time and never measured: a static export has no browser to
 * ask, and a sheet whose headline resized itself after hydration would print
 * differently from the preview it was printed off. Characters are a coarse
 * proxy for width, which is the right kind of coarse here, because every step
 * has a whole line of slack under it.
 *
 * 96% of the register's names are ten characters or fewer and take the top
 * step; the ladder exists for the eighteen that are a name with the breed and
 * the age written into it ("Rolf, nemški ovčar, 8 let"), which is how one
 * shelter lists its dogs.
 */
export function headlineStep(name: string): "l" | "m" | "s" | "xs" {
  if (name.length <= 10) return "l";
  if (name.length <= 16) return "m";
  if (name.length <= 24) return "s";
  return "xs";
}

/** The plea, or nothing. Past LONG_STAY_MONTHS the site stops stating the
 *  wait and asks about it instead, in the animal's own name; the sheet
 *  follows that one decision rather than making its own. The shorter wait is
 *  a tile like the rest (see stayTile in poster-facts.tsx). */
function pleaLine(
  animal: AnimalFields,
  locale: Locale,
  reference: Date,
  name: string,
): string | undefined {
  const months = longStayMonths(animal, reference);
  if (months === undefined) return undefined;
  const duration = ageLabel(months, locale);
  return animal.name
    ? translate(locale, "longStay", { name, duration })
    : translate(locale, "longStayUnnamed", { duration });
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

  const tiles = posterTiles(animal, locale, reference);
  const plea = pleaLine(animal, locale, reference, name);
  // Reserved and held are the two states worth a word beside the name: the
  // animal is on the shelter's list and is not waiting for this reader's
  // decision. Available says nothing, the way the site's own badge says
  // nothing (components/status-badge.tsx).
  const status =
    animal.status === "reserved" || animal.status === "hold"
      ? statusLabel(animal.status, locale)
      : undefined;

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
          <SpeciesMark strokeWidth={0.8} />
        </div>
      )}

      {/* The name and, where there is one, the word that says the animal is
          already spoken for. Beside the name rather than under it, because it
          qualifies the name and a reader who takes the sheet in from three
          metres away reads those two things as one. */}
      <div className="poster-head">
        <h1 className={cn("poster-headline", `poster-headline--${headlineStep(name)}`)}>
          {name}
        </h1>
        {status && <span className="poster-status">{status}</span>}
      </div>
      {/* "išče dom" is a claim, and an animal the shelter has taken off the
          list is not making it. The status word beside the name says what is
          true instead, so the sentence yields to it rather than printing its
          own contradiction under it. */}
      {!status && <p className="poster-seeking">{text.seeking}</p>}

      {plea && <p className="poster-plea">{plea}</p>}

      <PosterFacts tiles={tiles} />

      <div className="poster-spacer" />

      {/* Who to ask, and how to find the page: one soft band across the foot
          of the sheet. The two of them are one answer to one question and the
          rule that used to separate them made them two. */}
      <div className="poster-band">
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
          <p className="poster-shelter-city">{animal.shelter.city}</p>
          {/* The one thing a passer-by copies off a wall, so it is set at the
              shelter's own size rather than as a tail on the town's line. */}
          {phone && <p className="poster-shelter-phone">{phone}</p>}
          <p className="poster-shelter-note">{text.adoption}</p>
        </div>

        <div className="poster-qr">
          {/* The code keeps a white plate of its own inside the band's paper
              tone: a symbol read by a camera wants white all the way out to
              its quiet zone, and the band is not white. */}
          <span className="poster-qr-plate">
            <QrCode value={url} label={text.qrLabel(name)} />
          </span>
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
        <span className="poster-brand">
          {/* The site's own mark, read off app/icon.svg during the export and
              re-fronted with the sheet's ink. See lib/brand-mark.ts for why
              neither the favicon's fill nor the header's mask can serve a
              printer. */}
          <svg
            className="poster-brand-mark"
            viewBox={BRAND_MARK_VIEWBOX}
            fill="#111111"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: brandMarkPaths() }}
          />
          <span className="poster-wordmark">posvoji.si</span>
        </span>
        <span>{text.asOf(registerDateLabel(generatedAt, locale))}</span>
      </p>
    </div>
  );
}
