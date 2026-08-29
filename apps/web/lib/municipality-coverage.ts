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
  detailHref: string;
  km: number;
};

export type LookupEntry = {
  name: string;
  coverage: LookupCoverage[];
  /** Populated only when `coverage` is empty. */
  nearest: NearbyShelter[];
};

/** One municipality a shelter is on record as covering. `species` is set only
 *  where the registry limits the shelter to one species, the same way
 *  LookupCoverage carries it. */
export type CoveredMunicipality = {
  name: string;
  species?: "dogs" | "cats";
};

/** A source behind at least one row of a shelter's coverage, kept whole so a
 *  page can cite it the way the coverage card does. */
export type CoverageCitation = {
  id: string;
  label: string;
  url?: string;
  date: string;
};

export type ShelterCoverage = {
  municipalities: CoveredMunicipality[];
  /** The distinct sources behind those municipalities, in the order the
   *  registry first cites them. */
  sources: CoverageCitation[];
  /** True only when every source behind the list is confirmed. The dated
   *  source caveat is keyed on this, same as the coverage card. */
  confirmed: boolean;
};

/** Municipality names are Slovenian in both locales, so they collate under
 *  "sl" whatever the page locale is. */
const municipalityCollator = new Intl.Collator("sl");

// The reverse of the mapping buildMunicipalityEntries reads: one groupBy over
// the same rows, keyed by shelter id, so a shelter page can answer "which
// občine is this shelter responsible for". Cached because
// data/municipalities.yaml is checked into the repo and cannot change while
// pages are being rendered, and every shelter page asks for the index.
let coverageIndex: Map<string, ShelterCoverage> | undefined;

export function buildShelterCoverageIndex(): Map<string, ShelterCoverage> {
  if (coverageIndex !== undefined) return coverageIndex;

  const { municipalities, sources } = loadMunicipalities();
  const shelterIds = new Set(loadShelters().map((shelter) => shelter.id));

  type Group = {
    municipalities: Map<string, CoveredMunicipality>;
    sources: Map<string, CoverageCitation>;
    confirmed: boolean;
  };
  const grouped = new Map<string, Group>();

  for (const municipality of municipalities) {
    for (const coverage of municipality.coverage) {
      const source = sources[coverage.source];
      // A row pointing at an unknown shelter or source is a data bug the
      // registry tests catch. Dropping it holds the promise this index makes:
      // every municipality it names belongs to a real shelter and is backed
      // by a source the page can print.
      if (!shelterIds.has(coverage.shelter) || !source) continue;

      let group = grouped.get(coverage.shelter);
      if (!group) {
        group = {
          municipalities: new Map(),
          sources: new Map(),
          confirmed: true,
        };
        grouped.set(coverage.shelter, group);
      }

      const seen = group.municipalities.get(municipality.name);
      if (seen) {
        // One shelter listed twice in the same municipality covers both
        // species there, so the merged entry carries no species tag.
        if (seen.species !== coverage.species) seen.species = undefined;
      } else {
        group.municipalities.set(municipality.name, {
          name: municipality.name,
          species: coverage.species,
        });
      }

      group.sources.set(coverage.source, {
        id: coverage.source,
        label: source.label,
        url: source.url,
        date: source.date,
      });
      if (!source.confirmed) group.confirmed = false;
    }
  }

  const index = new Map<string, ShelterCoverage>();
  for (const [shelterId, group] of grouped) {
    index.set(shelterId, {
      municipalities: [...group.municipalities.values()].sort((a, b) =>
        municipalityCollator.compare(a.name, b.name),
      ),
      sources: [...group.sources.values()],
      confirmed: group.confirmed,
    });
  }

  coverageIndex = index;
  return coverageIndex;
}

/** The municipalities one shelter covers, or undefined when the registry has
 *  no row for it. Undefined rather than an empty entry, so a caller renders
 *  nothing at all instead of an empty heading. */
export function shelterCoverage(
  shelterId: string,
): ShelterCoverage | undefined {
  return buildShelterCoverageIndex().get(shelterId);
}

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

  function nearestTo(name: string): NearbyShelter[] {
    const centroid = centroids.get(name);
    if (!centroid) return [];
    return placed
      .map(({ shelter, at }) => ({
        shelterId: shelter.id,
        shelterName: shelter.name,
        city: shelter.city,
        phone: shelter.phone,
        detailHref: `${detailBase}/${shelter.id}`,
        km: Math.round(distanceKm(centroid, at)),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, NEAREST_COUNT);
  }

  return municipalities.map((municipality) => ({
    name: municipality.name,
    nearest:
      municipality.coverage.length === 0 ? nearestTo(municipality.name) : [],
    coverage: municipality.coverage.flatMap((coverage) => {
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
          detailHref: `${detailBase}/${shelter.id}`,
          animals: counts.get(shelter.id) ?? 0,
          species: coverage.species,
          sourceLabel: source.label,
          sourceUrl: source.url,
          sourceDate: source.date,
          confirmed: source.confirmed,
        },
      ];
    }),
  }));
}
