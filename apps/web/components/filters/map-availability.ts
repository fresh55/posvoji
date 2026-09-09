import type { Locale } from "@/lib/i18n";
import type { ShelterPin, Town } from "@/lib/map-layout";

export const mapAvailabilityText = {
  sl: {
    noMatches: "Ni živali, ki ustrezajo filtrom",
    noListings: "Trenutno brez objavljenih živali",
    noMatchesLegend: "Brez zadetkov s temi filtri",
    noListingsLegend: "Brez objavljenih živali",
    select: "Izberi",
    remove: "Odstrani iz izbora",
  },
  en: {
    noMatches: "No animals match your filters",
    noListings: "No animals currently listed",
    noMatchesLegend: "No matches with these filters",
    noListingsLegend: "No animals listed",
    select: "Select",
    remove: "Remove from selection",
  },
} satisfies Record<Locale, Record<string, string>>;

export function shelterAvailability(shelter: ShelterPin, locale: Locale): string | undefined {
  if (shelter.selectable === false) return mapAvailabilityText[locale].noListings;
  if (shelter.count === 0) return mapAvailabilityText[locale].noMatches;
  return undefined;
}

/** Geography, publication coverage and the active filter are separate facts. */
export function regionAvailability(
  towns: Town[],
  locale: Locale,
  noLocations: string,
): string {
  const shelters = towns.flatMap((town) => town.shelters);
  if (shelters.length === 0) return noLocations;
  return shelters.some((shelter) => shelter.selectable !== false)
    ? mapAvailabilityText[locale].noMatches
    : mapAvailabilityText[locale].noListings;
}
