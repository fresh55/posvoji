import {
  MAX_CLUSTER_DISCS,
  townIsLive,
  shelterIsSelectable,
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
      !(live && shelterIsSelectable(shelter, selected)),
  );
}

export type MapFacts = {
  hasSelected: boolean;
  hasMixed: boolean;
  hasEmpty: boolean;
  hasFilteredEmpty?: boolean;
  /** How many steps of the density ramp the choropleth actually drew, counted
   *  over the live regions alone.
   *
   *  The ramp's legend row is a ranking, and a ranking of one shape is not a
   *  ranking: filtered down to a species one shelter has, the plate held eleven
   *  inert regions and a single tinted one while the key underneath still
   *  printed all five steps with "fewer animals" and "more animals" around
   *  them. The caller gates the row on this being more than one, which is the
   *  same rule every other row in that legend already follows: it is drawn
   *  while the state it explains is on the map, and not otherwise.
   *
   *  Optional so an initial facts object need not name it; a caller with no
   *  facts yet has nothing to draw a ramp for either. */
  densitySteps?: number;
};

/** What one look at the laid-out country says, for the panel and its legend.
 *
 *  Each is a state the legend grows a row for, and each row waits for the
 *  thing it explains to exist: the solid selection green the moment a region
 *  is picked whole, the dashed border when one is partly picked, and the
 *  hollow circles with their distinct publication or filter explanations.
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
    hasEmpty: towns.some((town) => townDrawsEmptyMark(town, selected) &&
      town.shelters.some((shelter) => shelter.selectable === false)),
    hasFilteredEmpty: towns.some((town) => townDrawsEmptyMark(town, selected) &&
      town.shelters.some((shelter) => shelter.selectable !== false &&
        shelter.count === 0 && !selected.includes(shelter.value))),
    // Distinct steps and not the count of live regions: two regions on the
    // same step are one tint, and one tint is nothing to rank.
    densitySteps: new Set(
      regions.filter(({ stats }) => stats.live).map(({ stats }) => stats.density),
    ).size,
  };
}
