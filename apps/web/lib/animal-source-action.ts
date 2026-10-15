import type { AnimalFields, ClientAnimalSource } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import type { Locale } from "@/lib/i18n";
import { shelterPath } from "@/lib/shelter-path";
import { SITE_URL } from "@/lib/site";

/** Manual listings use the canonical Slovenian shelter page as their source
 * (ingest/portal-listings.ts). Present that contact route in the reader's
 * language, with the same behavior in the shelter box and the sticky bar. */
export function animalSourceAction(
  animal: AnimalFields,
  source: ClientAnimalSource | undefined,
  locale: Locale,
): {
  href: string;
  label: "contactShelter" | "viewOriginalListing" | "animalDetails";
  external: boolean;
} {
  if (source?.sourceUrl === `${SITE_URL}${shelterPath(animal.shelter.id, "sl")}`) {
    return {
      href: shelterPath(animal.shelter.id, locale),
      label: "contactShelter",
      external: false,
    };
  }
  return {
    href: source?.sourceUrl ?? animalPath(animal, locale),
    label: source ? "viewOriginalListing" : "animalDetails",
    external: true,
  };
}
