// Which point the shelter list sorts from. Two things can supply one: the
// browser's geolocation and a postcode or town the user types. Keeping the
// choice between them here, as plain functions over plain values, means the
// picker only has to render the answer.
import type { LatLon } from "./geo";
import { hasPrefixMatch, lookupPostal } from "./postal-lookup";

/** What the typed box currently amounts to. "empty" also covers an input that
 *  is still too short to be a finished attempt, so a half-typed town is not
 *  called a mistake. */
export type TypedLocation =
  | { status: "empty" }
  | { status: "matched"; at: LatLon; label: string }
  | { status: "unknown" };

// A name needs two letters before it can be wrong about anything, and a
// postcode needs all four digits. Below that the user is still typing.
const MIN_NAME_LENGTH = 2;

export function readTypedLocation(input: string): TypedLocation {
  const text = input.trim();
  if (text.length < MIN_NAME_LENGTH) return { status: "empty" };
  if (/^\d+$/.test(text) && text.length < 4) return { status: "empty" };

  const match = lookupPostal(text);
  if (match) return { status: "matched", at: match.at, label: match.label };

  // The same doctrine one line further: a word that some district name still
  // continues ("lju", "smar") is a name being typed, not a name that is wrong.
  // Only an input no district name can grow out of is called unknown.
  if (hasPrefixMatch(text)) return { status: "empty" };

  return { status: "unknown" };
}

export type OriginSource = "geolocation" | "typed" | "none";

export type ResolvedOrigin = {
  at?: LatLon;
  source: OriginSource;
  /** The matched district's name. Only a typed origin has one. */
  label?: string;
};

/** A live fix wins, because it is the more precise of the two and the user had
 *  to grant it. Switching geolocation back off falls through to the typed
 *  location if one is still matched, so the sort does not collapse to
 *  alphabetical under someone who typed a town first. */
export function resolveOrigin(
  geolocated: LatLon | undefined,
  typed: TypedLocation,
): ResolvedOrigin {
  if (geolocated) return { at: geolocated, source: "geolocation" };
  if (typed.status === "matched") {
    return { at: typed.at, source: "typed", label: typed.label };
  }
  return { source: "none" };
}
