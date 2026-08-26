import type { Metadata } from "next";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { municipalityPath } from "@/lib/municipality-path";
import { shelterPlateUrl } from "@/lib/shelter-share";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/** Names of the shelters responsible for a municipality, as one phrase.
 *  Two is the most any municipality has, and it is a split by species. */
function shelterNames(entry: LookupEntry): string {
  return [...new Set(entry.coverage.map((coverage) => coverage.shelterName))]
    .join(" in ");
}

/**
 * The title is the sentence somebody types into a search engine with their
 * own občina at the end of it, which is the whole reason these pages exist:
 * the interactive lookup answers "which shelter" perfectly and ranks for
 * nothing, because there is one address for all 212 answers.
 */
export function municipalityTitle(entry: LookupEntry): string {
  return `Si našel žival v občini ${entry.name}?`;
}

/**
 * Built from the coverage table's own fields, the same way animalDescription
 * is built from the dataset's: which shelter takes the animal, and the fact
 * that stops people reporting one at all, which is who pays. Never a
 * shelter's own words.
 */
export function municipalityDescription(entry: LookupEntry): string {
  if (entry.coverage.length === 0) {
    return `Za občino ${entry.name} nimamo preverjenega podatka o pristojnem zavetišču. Najbližja zavetišča s telefonskimi številkami in koraki po najdbi živali.`;
  }
  return `Za najdene živali v občini ${entry.name} je pristojno ${shelterNames(entry)}. Telefonska številka, kontakti in koraki po najdbi. Odlov in oskrbo krije občina, najditelja ne stane nič.`;
}

/**
 * Everything a shared municipality link needs. No hreflang alternates and no
 * `languages` block: there is no English copy of this page to point at, and
 * naming one that does not exist is worse than naming none. The canonical is
 * the page's own address, which is what the finder writes into the address
 * bar when it resolves the same municipality.
 *
 * The image is the responsible shelter's map plate, already drawn for that
 * shelter's own page. It is a map of Slovenia with the right region lifted,
 * which is close enough to a picture of "the answer for this občina" to be
 * worth more in a Facebook group than no card at all.
 */
export function municipalityMetadata(entry: LookupEntry): Metadata {
  const title = municipalityTitle(entry);
  const description = municipalityDescription(entry);
  const path = municipalityPath(entry.name);
  const plate = entry.coverage[0]
    ? shelterPlateUrl(entry.coverage[0].shelterId)
    : undefined;
  const images = plate
    ? [
        {
          url: plate,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt: `Zemljevid Slovenije z označeno lokacijo: ${entry.coverage[0].shelterName}, ${entry.coverage[0].city}.`,
        },
      ]
    : undefined;

  return {
    title: `${title} | Posvoji.si`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Posvoji.si",
      locale: "sl_SI",
      title,
      description,
      url: path,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: plate ? [plate] : undefined,
    },
  };
}
