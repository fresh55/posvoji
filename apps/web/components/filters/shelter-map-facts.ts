import {
  MAX_CLUSTER_DISCS,
  townIsLive,
  type RegionStats,
  type Town,
} from "@/lib/map-layout";

// Whether this town draws the hollow "nothing listed" circle anywhere on it.
// Read off townIsLive, which is what the marker itself decides from, so the
// legend row appears exactly when the circles do.
function townDrawsEmptyMark(town: Town, selected: string[]): boolean {
  // Past MAX_CLUSTER_DISCS the marker gives up on one disc per shelter and
  // says the number instead, and a count disc is never hollow.
  if (town.shelters.length > MAX_CLUSTER_DISCS) return false;
  const live = townIsLive(town, selected);
  // A single marker carries the town's own answer. It cannot be selected
  // while it is not live, so liveness settles it alone.
  if (town.shelters.length === 1) return !live;
  // In a cluster each disc answers for its own shelter, and an off-site one
  // stays hollow even in a town that has animals.
  return town.shelters.some(
    (shelter) =>
      !selected.includes(shelter.value) &&
      !(live && shelter.selectable !== false),
  );
}

export type MapFacts = {
  hasSelected: boolean;
  hasMixed: boolean;
  hasEmpty: boolean;
};

/** What one look at the laid-out country says, for the panel and its legend.
 *
 *  Each is a state the legend grows a row for, and each row waits for the
 *  thing it explains to exist: the solid selection green the moment a region
 *  is picked whole, the hatch the moment one is partly picked, the hollow
 *  circle the moment a shelter with nothing listed is drawn.
 *
 *  Takes the towns and region stats ShelterMap already memoizes. Laying towns
 *  out and grouping them by region are the expensive parts, so the legend
 *  reads those results instead of doing either job a second time.
 *
 *  hasEmpty is about markers; the caller decides whether the measured plate
 *  is currently large enough to draw and explain them. */
export function mapFacts(
  towns: Town[],
  regions: readonly { stats: RegionStats }[],
  selected: string[],
): MapFacts {
  return {
    hasSelected: regions.some(
      ({ stats }) => stats.live && stats.state === true,
    ),
    hasMixed: regions.some(
      ({ stats }) => stats.live && stats.state === "mixed",
    ),
    hasEmpty: towns.some((town) => townDrawsEmptyMark(town, selected)),
  };
}
