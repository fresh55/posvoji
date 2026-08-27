import type { Metadata } from "next";
import { translate } from "@/lib/i18n";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { municipalityPath } from "@/lib/municipality-path";
import { shareMetadata } from "@/lib/share-metadata";
import { shelterPlateAlt, shelterPlateUrl } from "@/lib/shelter-share";

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
 *
 * The same key the page sets its h1 from, not a second copy of the sentence.
 * Two sources for one sentence across 212 pages is a mismatch nothing on
 * screen would show: the tab and the search result would say one thing and
 * the heading another.
 */
export function municipalityTitle(entry: LookupEntry): string {
  return translate("sl", "muniPageHeading", { name: entry.name });
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
  const responsible = entry.coverage[0];
  const plate = responsible ? shelterPlateUrl(responsible.shelterId) : undefined;

  return shareMetadata({
    title: municipalityTitle(entry),
    description: municipalityDescription(entry),
    path: municipalityPath(entry.name),
    locale: "sl",
    image:
      plate && responsible
        ? {
            url: plate,
            alt: shelterPlateAlt(responsible.shelterName, responsible.city, "sl"),
          }
        : undefined,
  });
}
