"use client";

import { useI18n } from "@/components/i18n-context";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import { cityAt, distanceKm, formatKm } from "@/lib/geo";
import { META_SEPARATOR } from "@/lib/labels";

// The middot with its spaces held. The distance is a flex item of its own
// wherever it is drawn, and an ordinary space at the start of one is
// collapsed away.
const SEPARATOR = META_SEPARATOR.replaceAll(" ", "\u00a0");

/**
 * How far a shelter's town is from the point the visitor gave the location
 * picker, as the picker's own rows print it ("24 km"), or undefined while no
 * point has been given or the town is not one lib/geo.ts can place.
 *
 * The town and not the shelter's door, and in a straight line: the measure
 * Najbližje sorts by (lib/sort.ts), so a list in that order reads 3, 12, 24
 * down the page. formatKm rounds hard enough that nobody takes it for
 * directions.
 *
 * Read from the origin store the picker publishes to, so a page with no
 * picker on it, the animal's own page among them, draws no distance: a number
 * with nothing on screen saying where it is measured from is not an answer.
 */
function useShelterKm(city: string): string | undefined {
  const origin = useNearbyOrigin();
  const { messages } = useI18n();
  if (!origin) return undefined;
  const at = cityAt(city);
  return at
    ? formatKm(distanceKm(origin.at, at), messages.lessThanOneKm)
    : undefined;
}

/**
 * " · 24 km" after a shelter's name or its town, once there is an origin.
 *
 * Its own component so that it is the only thing an origin renders again: the
 * card around it is memoised (animal-card.tsx), and sixty of them drawing
 * again for a place typed into the picker would be the whole grid for one
 * number each. shrink-0 and nowrap, because the distance is the half of the
 * line that must not be cut: the name beside it truncates first.
 */
export function ShelterDistance({ city }: { city: string }) {
  const km = useShelterKm(city);
  if (km === undefined) return null;
  return (
    <span data-slot="shelter-km" className="shrink-0 whitespace-nowrap">
      {SEPARATOR}
      {km}
    </span>
  );
}
