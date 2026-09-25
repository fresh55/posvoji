import { project, type LatLon } from "./geo";
import { REGION_SHAPES, regionAt } from "./map-regions";
import {
  groupTownsByRegion as group,
  regionStatsByRegion as stats,
  type Town,
} from "./map-layout-core";

// Full-map callers use geographic shapes; the thumbnail supplies precomputed ids.
export * from "./map-layout-core";

/** The id of the region a point stands in, from the geographic shapes: the
 *  one lookup every full map groups its towns by. */
export function regionIdAt(at: LatLon): number | undefined {
  return regionAt(project(at))?.id;
}

export function groupTownsByRegion(towns: Town[]) {
  return group(towns, regionIdAt);
}
export function regionStatsByRegion(
  byRegion: Map<number, Town[]>,
  selected: string[],
  rank = true,
) {
  return stats(byRegion, selected, REGION_SHAPES, rank);
}
