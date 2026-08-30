import { describe, expect, it } from "vitest";
import { loadMunicipalities } from "./municipalities";
import {
  buildShelterCoverageIndex,
  shelterCoverage,
} from "./municipality-coverage";
import { loadShelters } from "./shelters";

// The shelter detail page reads the municipality registry from the shelter's
// end. These checks keep that reverse index honest against the forward
// mapping the found-animal lookup uses: same rows, same sources, no shelter
// gaining or losing an občina on the way.
describe("shelter coverage index", () => {
  const { municipalities, sources } = loadMunicipalities();
  const index = buildShelterCoverageIndex();

  it("keys only shelters from the shelter registry", () => {
    const shelterIds = new Set(loadShelters().map((shelter) => shelter.id));
    for (const shelterId of index.keys()) {
      expect(shelterIds, shelterId).toContain(shelterId);
    }
  });

  it("names the same municipalities the forward mapping does", () => {
    const forward = new Map<string, Set<string>>();
    for (const municipality of municipalities) {
      for (const entry of municipality.coverage) {
        const named = forward.get(entry.shelter) ?? new Set<string>();
        named.add(municipality.name);
        forward.set(entry.shelter, named);
      }
    }

    expect(index.size).toBe(forward.size);
    for (const [shelterId, named] of forward) {
      const covered = index.get(shelterId);
      expect(covered, shelterId).toBeDefined();
      expect(new Set(covered!.municipalities.map((m) => m.name))).toEqual(
        named,
      );
    }
  });

  it("sorts municipality names the Slovenian way", () => {
    const collator = new Intl.Collator("sl");
    for (const [shelterId, covered] of index) {
      const names = covered.municipalities.map((m) => m.name);
      expect(names, shelterId).toEqual([...names].sort(collator.compare));
    }
  });

  it("carries the species tag only where the registry limits one", () => {
    const limited = municipalities.find((municipality) =>
      municipality.coverage.some((entry) => entry.species),
    );
    expect(limited).toBeDefined();
    for (const entry of limited!.coverage) {
      const covered = index.get(entry.shelter)?.municipalities.find(
        (m) => m.name === limited!.name,
      );
      expect(covered?.species, `${limited!.name}: ${entry.shelter}`).toBe(
        entry.species,
      );
    }
  });

  it("cites a declared source for every shelter it lists", () => {
    for (const [shelterId, covered] of index) {
      expect(covered.sources.length, shelterId).toBeGreaterThan(0);
      for (const source of covered.sources) {
        expect(sources, `${shelterId}: ${source.id}`).toHaveProperty(source.id);
        expect(source.label).toBe(sources[source.id].label);
        expect(source.date).toBe(sources[source.id].date);
      }
    }
  });

  it("is unconfirmed as soon as one source behind the list is", () => {
    for (const [shelterId, covered] of index) {
      const allConfirmed = covered.sources.every(
        (source) => sources[source.id].confirmed,
      );
      expect(covered.confirmed, shelterId).toBe(allConfirmed);
    }
  });

  it("answers for a single shelter", () => {
    const covered = shelterCoverage("ljubljana");
    expect(covered?.municipalities.map((m) => m.name)).toContain("Ljubljana");
    expect(covered?.municipalities.map((m) => m.name)).toContain("Bloke");
  });

  it("returns nothing for a shelter no municipality names", () => {
    // The page renders no heading at all on undefined, so an unknown id and a
    // registry shelter without coverage have to answer the same way.
    expect(shelterCoverage("does-not-exist")).toBeUndefined();
    const uncovered = loadShelters().find(
      (shelter) =>
        !municipalities.some((municipality) =>
          municipality.coverage.some((entry) => entry.shelter === shelter.id),
        ),
    );
    expect(uncovered).toBeDefined();
    expect(shelterCoverage(uncovered!.id)).toBeUndefined();
  });
});
