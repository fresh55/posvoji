// Turns "where am I" into "which občina", so someone standing over a found
// animal does not have to know how their municipality is spelled. Two ways in:
// a postcode or town typed into the box, and the device's own position.
//
// Both land on a postal district, which the generated table maps to the
// municipalities it covers. A district that straddles a border yields several,
// largest share first: that is a question for the reader, not a guess to make
// for them.
import { distanceKm, type LatLon } from "./geo";
import { POSTAL_DISTRICTS } from "./postal-districts";
import { POSTCODE_MUNICIPALITIES } from "./postcode-municipalities";
import { lookupPostal } from "./postal-lookup";

export type MunicipalityGuess = {
  /** The postal district the answer came from, for showing your work. */
  label: string;
  code: string;
  /** Largest share first. One entry is an answer, several are a question. */
  municipalities: string[];
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

/** The device's position, resolved through the nearest postal district. Exact
 *  boundaries are not needed here: the nearest district's municipalities are
 *  the shortlist, and the reader confirms which one. */
export function municipalitiesNear(at: LatLon): MunicipalityGuess | undefined {
  let best: { code: string; name: string; km: number } | undefined;
  for (const district of POSTAL_DISTRICTS) {
    const km = distanceKm(at, { lat: district.lat, lon: district.lon });
    if (!best || km < best.km) {
      best = { code: district.code, name: district.name, km };
    }
  }
  if (!best) return undefined;
  return guessFor(best.code, best.name);
}
