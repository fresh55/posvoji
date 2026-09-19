import { cityAt, distanceKm } from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import { loadMunicipalities } from "@/lib/municipalities";
import { MUNICIPALITY_CENTROIDS } from "@/lib/postcode-municipalities";
import { loadShelters } from "@/lib/shelters";

/** How many nearby shelters to offer a municipality we cannot answer for.
 *  Enough to try a second number, few enough to stay a shortlist. */
const NEAREST_COUNT = 3;

export type LookupCoverage = {
  shelterId: string;
  shelterName: string;
  city: string;
  phone?: string;
  email?: string;
  website?: string;
  /** When the phone is answered and what to dial when it is not; both from
   *  the register, both optional. See ShelterRegistryEntry. */
  hours?: string;
  onCallPhone?: string;
  detailHref: string;
  /** > 0 when the shelter shares a structured animal list on posvoji.si. */
  animals: number;
  species?: "dogs" | "cats";
  sourceLabel: string;
  sourceUrl?: string;
  sourceDate: string;
  confirmed: boolean;
};

/** A shelter offered only because it is close, never because it was verified
 *  as responsible. Shown when a municipality has no coverage at all, so the
 *  reader gets a number to call instead of a dead end. */
export type NearbyShelter = {
  shelterId: string;
  shelterName: string;
  city: string;
  phone?: string;
  /** The same two register fields LookupCoverage carries, for the same
   *  reason: the shortlist's first call is a call, and when it is made out of
   *  hours the number that is answered then is the one worth offering. */
  hours?: string;
  onCallPhone?: string;
  detailHref: string;
  /** Straight-line kilometres from the municipality's centroid to the
   *  shelter's town, rounded for printing only. The order of the list is
   *  decided on the unrounded value. */
  km: number;
};

export type LookupEntry = {
  name: string;
  coverage: LookupCoverage[];
  /** Populated only when `coverage` is empty. */
  nearest: NearbyShelter[];
};

// Build-time join of the three registries a municipality answer needs: the
// municipality → shelter mapping, the shelter contacts, and how many animals
// each shelter currently shares on the site. Runs on the server only; the
// result is plain data a client component can take as a prop.
export function buildMunicipalityEntries(
  locale: Locale,
  animals: { shelter: { id: string } }[],
): LookupEntry[] {
  const { municipalities, sources } = loadMunicipalities();
  const shelters = new Map(loadShelters().map((s) => [s.id, s]));
  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";

  const counts = new Map<string, number>();
  for (const animal of animals) {
    counts.set(animal.shelter.id, (counts.get(animal.shelter.id) ?? 0) + 1);
  }

  const centroids = new Map(
    MUNICIPALITY_CENTROIDS.map((entry) => [entry.name, entry]),
  );
  // Every registry shelter we can place on the map, as candidates for the
  // "nearest" fallback.
  const placed = [...shelters.values()].flatMap((shelter) => {
    const at = cityAt(shelter.city);
    return at ? [{ shelter, at }] : [];
  });

  // Ordered on the measured distance and rounded only on the way out. Sorting
  // on the rounded kilometre let two shelters a few hundred metres apart tie,
  // and a tie is resolved by whatever order the register happens to list them
  // in, which is not a fact about where they are.
  function nearestTo(name: string): NearbyShelter[] {
    const centroid = centroids.get(name);
    if (!centroid) return [];
    return placed
      .map(({ shelter, at }) => ({
        shelter,
        distance: distanceKm(centroid, at),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST_COUNT)
      .map(({ shelter, distance }) => ({
        shelterId: shelter.id,
        shelterName: shelter.name,
        city: shelter.city,
        phone: shelter.phone,
        hours: shelter.hours,
        onCallPhone: shelter.onCallPhone,
        detailHref: `${detailBase}/${shelter.id}`,
        km: Math.round(distance),
      }));
  }

  return municipalities.map((municipality) => {
    const coverage = municipality.coverage.flatMap((coverage) => {
      const shelter = shelters.get(coverage.shelter);
      const source = sources[coverage.source];
      // A coverage row pointing at an unknown shelter or source is a data
      // bug; the tests catch it, and the entry degrades to "unverified".
      if (!shelter || !source) return [];
      return [
        {
          shelterId: shelter.id,
          shelterName: shelter.name,
          city: shelter.city,
          phone: shelter.phone,
          email: shelter.email,
          website: shelter.website,
          hours: shelter.hours,
          onCallPhone: shelter.onCallPhone,
          detailHref: `${detailBase}/${shelter.id}`,
          animals: counts.get(shelter.id) ?? 0,
          species: coverage.species,
          sourceLabel: source.label,
          sourceUrl: source.url,
          sourceDate: source.date,
          confirmed: source.confirmed,
        },
      ];
    });
    return {
      name: municipality.name,
      coverage,
      // A broken source or shelter reference can remove every coverage row.
      // Decide from the usable answer so that degradation still offers help.
      nearest: coverage.length === 0 ? nearestTo(municipality.name) : [],
    };
  });
}
