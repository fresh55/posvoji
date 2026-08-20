import { describe, expect, it } from "vitest";
import { loadMunicipalities } from "./municipalities";
import { loadShelters } from "./shelters";

// data/municipalities.yaml is hand-maintained reference data. These checks
// keep it honest: the full municipality list, no duplicates, every coverage
// entry pointing at a real shelter and a cited source, and no municipality
// with two shelters claiming the same species.
describe("municipality registry", () => {
  const { municipalities, sources } = loadMunicipalities();

  it("lists all 212 municipalities exactly once", () => {
    expect(municipalities).toHaveLength(212);
    const names = new Set(municipalities.map((m) => m.name));
    expect(names.size).toBe(212);
  });

  it("references only shelters from the shelter registry", () => {
    const shelterIds = new Set(loadShelters().map((s) => s.id));
    for (const municipality of municipalities) {
      for (const entry of municipality.coverage) {
        expect(shelterIds, `${municipality.name}: ${entry.shelter}`).toContain(
          entry.shelter,
        );
      }
    }
  });

  it("cites a declared source on every coverage entry", () => {
    for (const municipality of municipalities) {
      for (const entry of municipality.coverage) {
        expect(sources, `${municipality.name}: ${entry.source}`).toHaveProperty(
          entry.source,
        );
      }
    }
  });

  it("never assigns the same species twice in one municipality", () => {
    for (const municipality of municipalities) {
      const seen = new Set<string>();
      for (const entry of municipality.coverage) {
        const claimed = entry.species ? [entry.species] : ["dogs", "cats"];
        for (const species of claimed) {
          expect(seen.has(species), `${municipality.name}: ${species}`).toBe(
            false,
          );
          seen.add(species);
        }
      }
    }
  });

  it("has a meaningful amount of verified coverage", () => {
    const covered = municipalities.filter((m) => m.coverage.length > 0);
    expect(covered.length).toBeGreaterThanOrEqual(150);
  });
});
