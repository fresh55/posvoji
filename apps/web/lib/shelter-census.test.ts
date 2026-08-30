import { describe, expect, it } from "vitest";
import { loadDataset } from "./dataset";
import { shelterCensus } from "./shelter-census";
import { loadShelters } from "./shelters";

const REGISTER = [
  { id: "zonzani" },
  { id: "horjul" },
  { id: "johanca" },
];

function animalsAt(...ids: string[]) {
  return ids.map((id) => ({ shelter: { id } }));
}

describe("shelterCensus", () => {
  // The two statements the page makes about the same fact. Every assertion
  // below is one of them read against the other, because that is the pair
  // nothing used to check.
  it("counts one pill per shelter that shares a list", () => {
    const census = shelterCensus(REGISTER, animalsAt("zonzani", "zonzani", "horjul"));

    expect(census.byShelter.size).toBe(census.withData);
    expect([...census.byShelter.keys()].sort()).toEqual(["horjul", "zonzani"]);
    expect(census.withData).toBe(2);
  });

  it("makes the animal total the sum of the pills", () => {
    const census = shelterCensus(
      REGISTER,
      animalsAt("zonzani", "zonzani", "zonzani", "horjul"),
    );

    const pills = [...census.byShelter.values()];
    expect(pills.reduce((sum, count) => sum + count, 0)).toBe(census.animals);
    expect(census.animals).toBe(4);
  });

  it("leaves a shelter that shares nothing out rather than printing a zero", () => {
    const census = shelterCensus(REGISTER, animalsAt("zonzani"));

    expect(census.byShelter.has("johanca")).toBe(false);
    expect(census.byShelter.get("johanca")).toBeUndefined();
    expect(census.withData).toBe(1);
  });

  // The disagreement the join exists to prevent: before this was pulled out
  // of the page, an animal at an unregistered shelter added one to the
  // provider count and its animals to the total, and drew no card for either.
  it("reports an animal at an unregistered shelter instead of counting it", () => {
    const census = shelterCensus(
      REGISTER,
      animalsAt("zonzani", "kdo-ve", "kdo-ve"),
    );

    expect(census.unregistered).toEqual(["kdo-ve"]);
    expect(census.withData).toBe(1);
    expect(census.animals).toBe(1);
    expect(census.byShelter.has("kdo-ve")).toBe(false);
  });

  it("names every unregistered shelter once, sorted", () => {
    const census = shelterCensus(
      REGISTER,
      animalsAt("beta", "alfa", "beta", "alfa"),
    );

    expect(census.unregistered).toEqual(["alfa", "beta"]);
    expect(census.withData).toBe(0);
    expect(census.animals).toBe(0);
  });

  it("counts nothing from an empty dataset", () => {
    const census = shelterCensus(REGISTER, []);

    expect(census.withData).toBe(0);
    expect(census.animals).toBe(0);
    expect(census.unregistered).toEqual([]);
  });
});

// The same invariants against the data the site actually builds from, so a
// dataset export that enables a provider the register does not list fails
// here rather than on the page. Skipped when data/dist/animals.json is
// absent, which is the ordinary state of a checkout that has not ingested.
describe("the register and the dataset the site is built from", () => {
  const animals = loadDataset()?.animals;

  it.skipIf(animals === undefined)(
    "holds no animal at a shelter the register does not list",
    () => {
      const census = shelterCensus(loadShelters(), animals ?? []);

      expect(census.unregistered).toEqual([]);
    },
  );

  it.skipIf(animals === undefined)(
    "counts every animal it holds, so the census is the sum of the pills",
    () => {
      const census = shelterCensus(loadShelters(), animals ?? []);

      expect(census.animals).toBe(animals?.length);
      expect(census.withData).toBeGreaterThan(0);
      expect(census.withData).toBeLessThanOrEqual(loadShelters().length);
    },
  );
});
