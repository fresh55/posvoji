import { Fragment } from "react";
import { EyeClosed } from "lucide-react";
import { Logo } from "@/components/logo";
import { headlineStep } from "@/components/poster/animal-poster";
import { PosterFacts, type PosterTile } from "@/components/poster/poster-facts";
import { QrCode } from "@/components/poster/qr-code";
import { HEALTH_ICONS, SPECIES_ICONS } from "@/lib/animal-icons";
import type { Locale } from "@/lib/i18n";
import { META_SEPARATOR, statusLabel } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_SHARE_IMAGE,
  sreckoDateLabel,
  type SreckoEventKey,
} from "@/lib/srecko";
import { cn } from "@/lib/utils";
import "./poster.css";

/**
 * Srečko on one sheet of A4, the way every animal on the site gets one.
 *
 * The same sheet as animal-poster.tsx, read by someone who has seen one of
 * those: his name at the top, what is true about him as tiles, the code at
 * the foot. Three things are different, and each of them is a fact about him
 * rather than a change of mind about the sheet. He was adopted, so the second
 * line is the settled word instead of a claim that he is looking. There is no
 * shelter to name, so the band carries the site's own mark and the sentence
 * that says why the site is here. And there is no dataset behind him, so the
 * sheet carries no "stanje" date: what it says was true and stays true.
 *
 * A server component, like the sheet it follows. Nothing here is interactive,
 * because paper is not.
 */

type SreckoPosterText = {
  /** The about page's own dedication, printed where an animal's sheet prints
   *  "Posvojitev vedno poteka pri zavetišču." Copied rather than imported:
   *  the sentence lives in a `copy` block inside about-page.tsx, and this
   *  sheet is the second surface to say it. */
  dedication: string;
  species: string;
  oneEye: string;
  felv: string;
  events: Record<SreckoEventKey, string>;
  credit: string;
  qrLabel: string;
};

const posterText = {
  sl: {
    dedication: "Ta stran je v spomin na Srečka.",
    // "Maček" and not the register's "Mačka". The species word on a card is
    // the noun for the species; this sheet is about one cat with a name and a
    // sex, and it carries no sex tile, so the word does that work.
    species: "Maček",
    oneEye: "Eno oko",
    // The site models the virus as a field on a cat and names only the
    // negative ("Brez FeLV" in lib/filters/metadata.ts), because that is what
    // a filter can match. A positive result is the thing that filter hides,
    // so the sheet has to say it in words of its own.
    felv: "FeLV pozitiven",
    events: {
      listed: "V zavetišču",
      adopted: "Posvojen",
      died: "Umrl",
    },
    credit:
      "Upodobitev: Cat [Murdered: Soul Suspect], mark2580, CC BY 4.0, prilagojeno.",
    qrLabel: "QR koda za Srečkovo stran",
  },
  en: {
    dedication: "This site is in memory of Srečko.",
    species: "Cat",
    oneEye: "One eye",
    felv: "FeLV positive",
    events: {
      listed: "In a shelter",
      adopted: "Adopted",
      died: "Died",
    },
    credit:
      "Render: Cat [Murdered: Soul Suspect] by mark2580, CC BY 4.0, adapted.",
    qrLabel: "QR code for Srečko's page",
  },
} satisfies Record<Locale, SreckoPosterText>;

/** The still the page shows before the model loads, and the only picture of
 *  him the repo holds. Opaque, and white to its own edges, which is what
 *  .poster-photo--render is for. */
const RENDER = "/models/our-cat/poster.webp";

/**
 * What the sheet says about him, in the tiles the register's sheets wear.
 *
 * Three facts and no more. No age, because nobody recorded one; no wait,
 * because his is over. The two greys are who he was and the amber is the
 * thing that kept him waiting: the filter green states a health record a
 * visitor is looking for, and a positive test is not that.
 */
function sreckoTiles(locale: Locale): PosterTile[] {
  const text = posterText[locale];
  return [
    {
      key: "species",
      label: text.species,
      tone: "identity",
      glyph: { kind: "lucide", Icon: SPECIES_ICONS[SRECKO.species] },
    },
    {
      key: "eyes",
      label: text.oneEye,
      tone: "identity",
      // The right eye was missing and had healed closed, which is how the
      // model on the about page draws him.
      glyph: { kind: "lucide", Icon: EyeClosed },
    },
    {
      key: "felv",
      label: text.felv,
      tone: "wait",
      // The mark the site's own FeLV filter wears, so the same fact does not
      // arrive here wearing a second symbol.
      glyph: { kind: "lucide", Icon: HEALTH_ICONS["brez-felv"] },
    },
  ];
}

export function SreckoPoster({ locale }: { locale: Locale }) {
  const text = posterText[locale];
  const photo = SRECKO.photos[0];
  const status = statusLabel(SRECKO.status, locale);

  // His page in the sheet's own language, the way every animal's sheet
  // encodes the address it was built from.
  const url = `${SITE_URL}${SRECKO_PATHS[locale]}`;
  // The same address in letters, for someone with no phone in their hand.
  const printedUrl = `${SITE_URL.replace(/^https?:\/\//, "")}${SRECKO_PATHS[locale]}`;

  // A moment with a date is told with it, at whatever precision it was
  // recorded at, and one without is still told. The dates are read through
  // lib/srecko.ts rather than formatted here, so the sheet and his page cannot
  // write the same day two ways, and neither of them can print a date the
  // record does not hold.
  const moments = SRECKO.timeline.map((event) => {
    const when = event.date ? sreckoDateLabel(event.date, locale) : undefined;
    return when ? `${text.events[event.key]}: ${when}` : text.events[event.key];
  });

  return (
    <div className="poster-sheet">
      {photo ? (
        <div className="poster-photo">
          {/* The register's sheet, exactly: the photo blown up and blurred to
              fill the frame, the whole uncropped photo on top. See
              animal-poster.tsx for why the tag is written out rather than
              handed to next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt="" aria-hidden className="poster-photo-fill" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={photo.alt[locale]}
            className="poster-photo-image"
          />
        </div>
      ) : (
        // No photographs yet, so the sheet prints the render the page shows
        // before the model loads. It is opaque and white to its edges, so it
        // takes the paper's own white and no blurred fill: there is nothing
        // here to letterbox.
        <div className="poster-photo poster-photo--render">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={RENDER}
            alt={SRECKO_SHARE_IMAGE.alt[locale]}
            className="poster-photo-image"
          />
        </div>
      )}

      {/* CC BY 4.0 asks for the credit to be carried with the work. The site
          carries it in the footer's disclosure (components/model-credit.tsx),
          and a sheet on a wall has no footer to press. Printed only where the
          render is: a photograph of him is ours to print and owes nobody a
          line. */}
      {!photo && <p className="poster-credit">{text.credit}</p>}

      <div className="poster-head">
        <h1
          className={cn(
            "poster-headline",
            `poster-headline--${headlineStep(SRECKO.name)}`,
          )}
        >
          {SRECKO.name}
        </h1>
        {/* The settled word, beside the name where the register's sheet puts
            a reservation. There is no "išče dom" under it, for the reason
            that sheet gives: it is a claim, and he is not making it. Quiet
            rather than amber: status-badge.tsx gives a reservation the warm
            tone because it is a maybe, and an adoption the muted one because
            it is over. The sheet keeps that distinction. */}
        {status && (
          <span className="poster-status poster-status--quiet">{status}</span>
        )}
      </div>

      <PosterFacts tiles={sreckoTiles(locale)} />

      {/* Three moments on one line, in the order they happened. Without their
          dates until somebody who knows them fills them in. */}
      <p className="poster-timeline">{moments.join(META_SEPARATOR)}</p>

      <div className="poster-spacer" />

      {/* Where the animal sheet names a shelter and a number to call, this one
          names the site and says why it exists. There is nobody to ring about
          Srečko. */}
      <div className="poster-band">
        <div className="poster-memorial">
          <span className="poster-brand">
            {/* The header's own mark, drawn the way the colophon draws it: a
                mask of app/icon.svg painting the sheet's ink. */}
            <Logo className="poster-brand-mark" />
            <span className="poster-wordmark">posvoji.si</span>
          </span>
          <p className="poster-dedication">{text.dedication}</p>
        </div>

        <div className="poster-qr">
          {/* The code keeps a white plate of its own inside the band's paper
              tone: a symbol read by a camera wants white all the way out to
              its quiet zone, and the band is not white. */}
          <span className="poster-qr-plate">
            <QrCode value={url} label={text.qrLabel} />
          </span>
          {/* A break opportunity after each separator, so the address wraps
              where a reader would expect it to. */}
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
    </div>
  );
}
