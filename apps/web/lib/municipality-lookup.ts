// Resolve typed places or device coordinates through postal districts.
// Districts can cover multiple municipalities, so the user may need to choose.
import { distanceKm, onMap, type LatLon } from "./geo";
import { POSTAL_DISTRICTS } from "./postal-districts";
import { POSTCODE_MUNICIPALITIES } from "./postcode-municipalities";
import { lookupPostal } from "./postal-lookup";

export type MunicipalityGuess = {
  /** Postal district name shown with the suggestions. */
  label: string;
  code: string;
  /** Municipality names, ordered by largest share of the postal district. */
  municipalities: string[];
  /** A coarse device fix is a suggestion even when only one name matches. */
  requiresConfirmation?: boolean;
};

const BY_CODE = new Map(
  POSTCODE_MUNICIPALITIES.map((entry) => [entry.code, entry]),
);

function guessFor(code: string, label: string): MunicipalityGuess | undefined {
  const entry = BY_CODE.get(code);
  if (!entry || entry.municipalities.length === 0) return undefined;
  return { label, code, municipalities: entry.municipalities };
}

/** A postcode or town name, the same input the shelter picker's place box
 *  takes, resolved to the municipalities it covers. */
export function municipalitiesForInput(
  input: string,
): MunicipalityGuess | undefined {
  const match = lookupPostal(input);
  if (!match) return undefined;
  return guessFor(match.code, match.label);
}

// Postal centroids are not municipal boundaries. These limits reject distant
// fixes and keep coarse ones tentative, without changing typed-place lookup.
const MAX_POSTAL_DISTANCE_KM = 20;
const MAX_DEVICE_ACCURACY_METERS = 1000;

/** The device's position suggests nearby municipalities; it never establishes
 * responsibility. The caller must ask the reader to confirm the municipality.
 * Keep fixes outside the supported map area from snapping across continents. */
export function municipalitiesNear(
  at: LatLon,
  accuracy = Infinity,
): MunicipalityGuess | undefined {
  if (
    !Number.isFinite(at.lat) || !Number.isFinite(at.lon) ||
    Math.abs(at.lat) > 90 || Math.abs(at.lon) > 180 || !onMap(at)
  ) {
    return undefined;
  }
  let best: { code: string; name: string; km: number } | undefined;
  for (const district of POSTAL_DISTRICTS) {
    const km = distanceKm(at, { lat: district.lat, lon: district.lon });
    if (!best || km < best.km) {
      best = { code: district.code, name: district.name, km };
    }
  }
  if (!best || best.km > MAX_POSTAL_DISTANCE_KM) return undefined;
  const guess = guessFor(best.code, best.name);
  if (!guess) return undefined;
  return {
    ...guess,
    requiresConfirmation:
      !Number.isFinite(accuracy) || accuracy < 0 ||
      accuracy > MAX_DEVICE_ACCURACY_METERS,
  };
}
