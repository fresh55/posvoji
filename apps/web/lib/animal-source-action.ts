import type { AnimalFields, ClientAnimalSource } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import type { Locale } from "@/lib/i18n";
import { shelterPath } from "@/lib/shelter-path";
import { SITE_URL } from "@/lib/site";

function onSiteSource(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    return new URL(url).origin === SITE_URL;
  } catch {
    return false;
  }
}

/** Sources on our origin come from apps/ingest/src/portal-listings.ts.
 * Recognize the origin independently of its persisted route, and present the
 * contact action consistently in the shelter box and the sticky bar. */
export function animalSourceAction(
  animal: AnimalFields,
  source: ClientAnimalSource | undefined,
  locale: Locale,
): {
  href: string;
  label: "contactShelter" | "viewOriginalListing" | "animalDetails";
  external: boolean;
} {
  if (onSiteSource(source?.sourceUrl)) {
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
