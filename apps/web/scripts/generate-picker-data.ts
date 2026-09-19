// Derive the picker-only coverage labels without serializing the full registry.
import { writeFileSync } from "node:fs";
import { buildMunicipalityEntries } from "../lib/municipality-coverage";
import { shelterNamesByRegion } from "../components/filters/location-picker/municipality-places";

import { CITIES, project } from "../lib/geo";
import { MINI_OUTLINE_PATH, MINI_REGION_PATHS, regionAt } from "../lib/map-regions";

const names = shelterNamesByRegion(buildMunicipalityEntries("sl", []));
writeFileSync(new URL("../lib/region-shelter-names.json", import.meta.url),
  JSON.stringify([...names], null, 2) + "\n");

// The thumbnail uses the same simplified paths and exact region membership as
// the full map, computed for every coordinate cityAt can return.
writeFileSync(new URL("../lib/mini-map-data.json", import.meta.url), JSON.stringify({
  outline: MINI_OUTLINE_PATH,
  regions: [...MINI_REGION_PATHS].map(([id, path]) => ({ id, path })),
  cityRegions: Object.fromEntries(Object.values(CITIES).map(at => [
    `${at.lat},${at.lon}`, regionAt(project(at))?.id,
  ])),
}) + "\n");
