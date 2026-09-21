import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  applyFilters, chipGains, EMPTY_FILTERS, facetCounts, homeCounts,
  parseFilters, serializeFilters, visibleGroups, waitingGroups, type Filters,
} from "../filters";

const now = new Date("2026-09-21T12:00:00Z");
const animal = (id: string, extra: Partial<Animal> = {}): Animal => ({
  id, species: "cat", status: "available", images: [], attribution: "Fixture",
  source: { providerId: "fixture", sourceUrl: "https://example.test/animal", fetchedAt: now.toISOString(), firstSeenAt: "2020-01-01T00:00:00Z", lastSeenAt: now.toISOString() },
  shelter: { id: "fixture", name: "Fixture", city: "Ljubljana" }, ...extra,
});

describe("reviewed appearance and home filters", () => {
  const black = animal("black-with-bib", { coatColor: "black", coatColors: ["black", "white"], coatLength: "long", adoptionRequirements: { onlyPet: true } });
  const brown = animal("brown-tabby", { coatColor: "brown", coatColors: ["black", "brown", "white"], coatLength: "short" });
  const white = animal("white-with-patches", { coatColor: "white", coatColors: ["black", "white"], coatLength: "short" });
  const multicolour = animal("balanced-patches", { coatColor: "multicolour", coatColors: ["black", "orange", "white"] });
  const unknown = animal("unknown", { coatColors: ["black", "white"] });
  const animals = [black, brown, white, multicolour, unknown];

  it("matches only reviewed dominant colour, leaving stripes, bibs and descriptive-only records out", () => {
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["black"] }, now)).toEqual([black]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["brown"] }, now)).toEqual([brown]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["multicolour"] }, now)).toEqual([multicolour]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["white", "black"] }, now)).toEqual([black, white]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["white"], coatLength: ["long"] }, now)).toEqual([]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, home: ["only-pet"] }, now)).toEqual([black]);
    expect(homeCounts(animals, EMPTY_FILTERS, now).get("only-pet")).toBe(1);
  });

  it("counts each known animal once across colour categories and computes removable chips", () => {
    const filters = { ...EMPTY_FILTERS, coatColor: ["black", "white"] as const };
    const state = { ...filters, coatColor: [...filters.coatColor] };
    const counts = facetCounts(animals, state, now);
    expect([...counts.coatColor]).toEqual([["black", 1], ["brown", 1], ["white", 1], ["multicolour", 1]]);
    expect([...counts.coatColor.values()].reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(chipGains(animals, state, now).get("coatColor:black")).toBe(-1);
    expect(chipGains(animals, state, now).get("coatColor:white")).toBe(-1);
  });

  it("round-trips all four filters in shared URLs and preserves selected unknown options", () => {
    const filters: Filters = { ...EMPTY_FILTERS, coatColor: ["black", "multicolour"], coatLength: ["long"], waiting: ["over-1-year"], home: ["only-pet"] };
    const state = { ...filters, coatLength: [...filters.coatLength], waiting: [...filters.waiting], home: [...filters.home] };
    expect(serializeFilters(state)).toContain("barva=crna,vecbarvna");
    expect(serializeFilters(state)).toContain("dlaka=dolga");
    expect(serializeFilters(state)).toContain("cakanje=nad-1-leto");
    expect(parseFilters(serializeFilters(state))).toEqual(state);
    expect(visibleGroups([unknown], state, now, true)).toMatchObject({ coatColor: true, coatLength: true, waiting: true });
  });
});

describe("two-toned colours", () => {
  // The case that started this: Mao is a tuxedo cat, predominantly black,
  // and a visitor pressing Črna does not expect him.
  const mao = animal("mao", { coatColor: "black", coatColors: ["black", "white"], whiteMarkings: "major" });
  const bib = animal("black-with-bib", { coatColor: "black", coatColors: ["black", "white"], whiteMarkings: "minor" });
  const solid = animal("solid-black", { coatColor: "black", coatColors: ["black"], whiteMarkings: "none" });
  // No answer recorded yet, which is every animal until the review runs.
  const unjudged = animal("unjudged", { coatColor: "black", coatColors: ["black", "white"] });
  const gingerAndWhite = animal("ginger", { coatColor: "orange", coatColors: ["orange", "white"], whiteMarkings: "major" });
  const animals = [mao, bib, solid, unjudged, gingerAndWhite];

  it("moves a major white out of the plain colour and leaves a bib behind", () => {
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["black"] }, now))
      .toEqual([bib, solid, unjudged]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["black-white"] }, now))
      .toEqual([mao]);
  });

  it("leaves a colour with no two-toned option where it was", () => {
    // Orange is under the 15-animal floor in COLOUR-REVIEW.md, so a major
    // white on a ginger animal still answers Oranžna.
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["orange"] }, now))
      .toEqual([gingerAndWhite]);
  });

  it("counts a two-toned answer separately and round-trips its slug", () => {
    const counts = facetCounts(animals, EMPTY_FILTERS, now);
    expect(counts.coatColor.get("black")).toBe(3);
    expect(counts.coatColor.get("black-white")).toBe(1);
    const state: Filters = { ...EMPTY_FILTERS, coatColor: ["black-white"] };
    expect(serializeFilters(state)).toContain("barva=crno-bela");
    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });
});

describe("shelter waiting thresholds", () => {
  it("uses intake date only, excludes unknown, invalid and future dates", () => {
    for (const date of [undefined, "invalid", "2026-02-30", "2026-09-22"]) expect(waitingGroups(date, now)).toEqual([]);
    expect(applyFilters([animal("old-observation")], { ...EMPTY_FILTERS, waiting: ["over-6-months"] }, now)).toEqual([]);
  });

  it("requires strictly more than each calendar threshold and ignores time of day", () => {
    expect(waitingGroups("2026-03-21", now)).toEqual([]);
    expect(waitingGroups("2026-03-20", now)).toEqual(["over-6-months"]);
    expect(waitingGroups("2025-09-21", now)).toEqual(["over-6-months"]);
    expect(waitingGroups("2025-09-20", now)).toEqual(["over-6-months", "over-1-year"]);
    expect(waitingGroups("2023-09-21", now)).toEqual(["over-6-months", "over-1-year"]);
    expect(waitingGroups("2023-09-20", now)).toEqual(["over-6-months", "over-1-year", "over-3-years"]);
  });

  it("clamps month-end and leap-day anniversaries", () => {
    expect(waitingGroups("2025-08-31", new Date("2026-02-28T23:59:00Z"))).toEqual([]);
    expect(waitingGroups("2025-08-31", new Date("2026-03-01T00:00:00Z"))).toEqual(["over-6-months"]);
    expect(waitingGroups("2024-02-29", new Date("2025-02-28T00:00:00Z"))).toEqual(["over-6-months"]);
    expect(waitingGroups("2024-02-29", new Date("2025-03-01T00:00:00Z"))).toEqual(["over-6-months", "over-1-year"]);
  });

  it("recomputes when the reference day changes, even for the same indexed animal list", () => {
    const animals = [animal("threshold", { intakeDate: "2026-03-21" })];
    const filters = { ...EMPTY_FILTERS, waiting: ["over-6-months"] as const };
    const state = { ...filters, waiting: [...filters.waiting] };
    expect(applyFilters(animals, state, now)).toEqual([]);
    expect(applyFilters(animals, state, new Date("2026-09-22T00:00:00Z"))).toEqual(animals);
  });
});
