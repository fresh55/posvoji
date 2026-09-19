// Derive the picker-only coverage labels without serializing the full registry.
import { writeFileSync } from "node:fs";
import { buildMunicipalityEntries } from "../lib/municipality-coverage";
import { shelterNamesByRegion } from "../components/filters/location-picker/municipality-places";

const names = shelterNamesByRegion(buildMunicipalityEntries("sl", []));
writeFileSync(new URL("../lib/region-shelter-names.json", import.meta.url),
  JSON.stringify([...names], null, 2) + "\n");
