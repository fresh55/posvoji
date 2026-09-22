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

  it("matches only the reviewed filter category, leaving stripes, bibs and descriptive-only records out", () => {
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

describe("reviewed colour categories", () => {
  const demeter = animal("demeter", { coatColor: "black-white", coatColors: ["black", "white"] });
  const kato = animal("kato", { coatColor: "brown-white", coatColors: ["black", "brown", "white"] });
  const ponco = animal("ponco", { coatColor: "orange-white", coatColors: ["orange", "white"] });
  const bib = animal("black-with-bib", { coatColor: "black", coatColors: ["black", "white"] });
  const white = animal("plain-white", { coatColor: "white", coatColors: ["white"] });
  const unknown = animal("unreviewed", { coatColors: ["black", "white"] });
  const animals = [demeter, kato, ponco, bib, white, unknown];

  it("keeps reviewed pairs out of both solid colours", () => {
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["white"] }, now)).toEqual([white]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["black"] }, now)).toEqual([bib]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["black-white"] }, now)).toEqual([demeter]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["brown-white"] }, now)).toEqual([kato]);
    expect(applyFilters(animals, { ...EMPTY_FILTERS, coatColor: ["orange-white"] }, now)).toEqual([ponco]);
  });

  it("keeps unclassified animals visible without a colour filter", () => {
    expect(applyFilters([unknown], EMPTY_FILTERS, now)).toEqual([unknown]);
    expect(applyFilters([unknown], { ...EMPTY_FILTERS, coatColor: ["black", "black-white"] }, now)).toEqual([]);
    expect(facetCounts([unknown], EMPTY_FILTERS, now).coatColor.size).toBe(0);
  });

  it("preserves the full palette without inferring a pair from it", () => {
    expect(demeter.coatColors).toEqual(bib.coatColors);
    const counts = facetCounts(animals, EMPTY_FILTERS, now);
    expect(counts.coatColor.get("black")).toBe(1);
    expect(counts.coatColor.get("black-white")).toBe(1);
    expect(counts.coatColor.get("brown-white")).toBe(1);
    expect(counts.coatColor.get("orange-white")).toBe(1);
    expect(counts.coatColor.get("white")).toBe(1);
  });

  it.each([
    ["black-white", "crno-bela"], ["brown-white", "rjavo-bela"],
    ["grey-white", "sivo-bela"], ["orange-white", "oranzno-bela"],
  ] as const)("round-trips the %s category", (colour, slug) => {
    const state: Filters = { ...EMPTY_FILTERS, coatColor: [colour] };
    expect(serializeFilters(state)).toContain(`barva=${slug}`);
    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });

  it("groups rare cream categories in orange controls without rewriting the animal", () => {
    const cream = animal("cream", { coatColor: "cream", coatColors: ["cream"] });
    const creamWhite = animal("cream-white", { coatColor: "cream-white", coatColors: ["cream", "white"] });
    expect(applyFilters([cream, creamWhite], { ...EMPTY_FILTERS, coatColor: ["orange"] }, now)).toEqual([cream]);
    expect(applyFilters([cream, creamWhite], { ...EMPTY_FILTERS, coatColor: ["orange-white"] }, now)).toEqual([creamWhite]);
    expect(cream.coatColor).toBe("cream");
    expect(creamWhite.coatColor).toBe("cream-white");
    expect(parseFilters("barva=kremna,oranzna").coatColor).toEqual(["orange"]);
    expect(parseFilters("barva=kremno-bela").coatColor).toEqual(["orange-white"]);
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
