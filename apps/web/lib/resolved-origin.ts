import type { LatLon } from "./geo";
import type { TypedLocation } from "./origin";

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
