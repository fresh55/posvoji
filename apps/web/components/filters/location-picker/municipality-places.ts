import { project, type LatLon } from "@/lib/geo";
import { regionAt } from "@/lib/map-regions";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { MUNICIPALITY_CENTROIDS } from "@/lib/postcode-municipalities";

// Where Slovenia's 212 občine are, and what that is used for. Its own module
// and not part of model.ts, which is where these two lived, because the table
// behind them is 47 KB of generated source and model.ts is read on the home
// page's first paint for one string helper (pickerFilterSummary, imported by
// animal-filters.tsx and filter-sidebar.tsx). Nothing on that first paint
// places a municipality: the map that does is fetched when the picker opens
// (picker-map-plate.tsx) and the finder that does is the found-animal page.

/** Every občina's GURS centroid, by the name the coverage table calls it. */
export const MUNICIPALITY_AT = new Map<string, LatLon>(
  MUNICIPALITY_CENTROIDS.map((entry) => [
    entry.name,
    { lat: entry.lat, lon: entry.lon },
  ]),
);

/** Which shelters answer for the municipalities inside each region, by region
 *  id, from the same coverage table the found-animal finder reads.
 *
 *  A region is found the way the map itself places a municipality (see
 *  lib/map-layout.ts): the občina's GURS centroid through project(), then
 *  regionAt() on the result. A name therefore lands in the region the map
 *  would have drawn that municipality in, rather than in one a second lookup
 *  table might disagree about.
 *
 *  Here rather than in the picker's map plate, because two surfaces feed the
 *  map this table: the homepage dialog and the found-animal page. */
export function shelterNamesByRegion(
  entries: readonly LookupEntry[],
): Map<number, string[]> {
  const byRegion = new Map<number, string[]>();
  for (const entry of entries) {
    // `nearest` is a shortlist of neighbours, not an answer about who is
    // responsible, so a municipality with no coverage contributes nothing.
    if (entry.coverage.length === 0) continue;
    const at = MUNICIPALITY_AT.get(entry.name);
    if (!at) continue;
    const region = regionAt(project(at));
    if (!region) continue;
    const names = byRegion.get(region.id) ?? [];
    // Deduped, in the order the table lists them: one shelter answers for
    // many občine and would otherwise be named once per municipality.
    for (const covered of entry.coverage) {
      if (!names.includes(covered.shelterName)) {
        names.push(covered.shelterName);
      }
    }
    byRegion.set(region.id, names);
  }
  return byRegion;
}
