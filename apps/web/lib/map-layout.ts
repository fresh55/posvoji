import { project } from "./geo";
import { REGION_SHAPES, regionAt } from "./map-regions";
import { groupTownsByRegion as group, regionStatsByRegion as stats, type Town } from "./map-layout-core";
export * from "./map-layout-core";

export function groupTownsByRegion(towns: Town[]) {
  return group(towns, at => regionAt(project(at)));
}
export function regionStatsByRegion(byRegion: Map<number, Town[]>, selected: string[], rank = true) {
  return stats(byRegion, selected, REGION_SHAPES, rank);
}
