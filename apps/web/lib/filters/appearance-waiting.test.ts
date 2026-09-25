import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  applyFilters, chipGains, EMPTY_FILTERS, facetCounts, groupOptions, liveInPool,
  poolCounts, valueChipLabel, parseFilters, serializeFilters, toggleGroupValue,
  visibleGroups, waitingGroups,
  type Filters, type WaitingGroup,
} from "../filters";

const now = new Date("2026-09-21T12:00:00Z");
const animal = (id: string, extra: Partial<Animal> = {}): Animal => ({
  id, species: "cat", status: "available", images: [], attribution: "Fixture",
  source: { providerId: "fixture", sourceUrl: "https://example.test/animal", fetchedAt: now.toISOString(), firstSeenAt: "2020-01-01T00:00:00Z", lastSeenAt: now.toISOString() },
  shelter: { id: "fixture", name: "Fixture", city: "Ljubljana" }, ...extra,
});

describe("reviewed appearance filters", () => {
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
    const filters: Filters = { ...EMPTY_FILTERS, coatColor: ["black", "multicolour"], coatLength: ["long"], waiting: ["over-1-year"], care: ["ongoing-care"] };
    const state = { ...filters, coatLength: [...filters.coatLength], waiting: [...filters.waiting], care: [...filters.care] };
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

  // The buckets are worked out once per list and day and then reused by every
  // counter, so a later hour, an earlier day and each counter have to read
  // the same answer a fresh walk would give.
  it("answers every counter from one reading per day, and reads again for another day", () => {
    const animals = [animal("threshold", { intakeDate: "2026-03-21" }), animal("long", { intakeDate: "2024-01-01" })];
    const state = { ...EMPTY_FILTERS, waiting: ["over-6-months"] } as Filters;
    const lateSameDay = new Date("2026-09-21T23:59:00Z");
    const nextDay = new Date("2026-09-22T00:00:00Z");
    expect(facetCounts(animals, EMPTY_FILTERS, now).waiting.get("over-6-months")).toBe(1);
    expect(applyFilters(animals, state, lateSameDay).map(({ id }) => id)).toEqual(["long"]);
    expect(facetCounts(animals, EMPTY_FILTERS, nextDay).waiting.get("over-6-months")).toBe(2);
    expect(visibleGroups([animals[0]], { ...EMPTY_FILTERS, waiting: [] }, nextDay, true).waiting).toBe(true);
    expect(visibleGroups([animals[0]], { ...EMPTY_FILTERS, waiting: [] }, now, true).waiting).toBe(false);
    expect(applyFilters(animals, state, now).map(({ id }) => id)).toEqual(["long"]);
  });
});

// A chip has no section heading beside it, so "Srednja" there was Velikost's
// answer and Dolžina dlake's at once.
describe("coat length chips", () => {
  it("name the coat, so they cannot be read as a size", () => {
    expect(valueChipLabel("coatLength", "medium", "sl")).toBe("Srednja dlaka");
    expect(valueChipLabel("coatLength", "long", "en")).toBe("Long coat");
    expect(valueChipLabel("coatLength", "hairless", "sl")).toBe("Brez dlake");
    expect(valueChipLabel("size", "medium", "sl")).toBe("Srednja");
  });

  it("say what a threshold is a wait of, the way the card's badge does", () => {
    expect(valueChipLabel("waiting", "over-1-year", "sl")).toBe("Čaka nad 1\u00a0leto");
    expect(valueChipLabel("waiting", "over-6-months", "en")).toBe("Waiting over 6\u00a0months");
  });
});

// The phone sheet's tiles wrap "Nad 6 mesecev" at 320px and 360px, and the
// break belongs between "Nad" and the duration, never inside it.
describe("waiting labels", () => {
  const values: WaitingGroup[] = ["over-6-months", "over-1-year", "over-3-years"];

  it.each(["sl", "en"] as const)("tie each number to its unit in %s", (locale) => {
    const labels = [
      ...groupOptions("waiting", [], locale).map(({ label }) => label),
      ...values.map((value) => valueChipLabel("waiting", value, locale)),
    ];
    expect(labels).toHaveLength(6);
    for (const label of labels) {
      expect(label).toMatch(/ \d\u00a0\p{L}+$/u);
    }
  });

  it("leave the slugs as they were", () => {
    expect(
      values.map((value) =>
        new URLSearchParams(serializeFilters({ ...EMPTY_FILTERS, waiting: [value] })).get("cakanje"),
      ),
    ).toEqual(["nad-6-mesecev", "nad-1-leto", "nad-3-leta"]);
  });
});

// The thresholds nest, so a second pick asks what the wider one already asks
// and the narrower tick would sit there doing nothing.
describe("time in shelter takes one threshold", () => {
  it("swaps the threshold rather than adding a second", () => {
    expect(toggleGroupValue("waiting", ["over-6-months"], "over-1-year")).toEqual(["over-1-year"]);
    expect(toggleGroupValue("waiting", ["over-1-year"], "over-1-year")).toEqual([]);
    expect(toggleGroupValue("sex", ["male"], "female")).toEqual(["male", "female"]);
  });

  it("keeps the wider threshold from an address that carries two", () => {
    expect(parseFilters("cakanje=nad-3-leta,nad-6-mesecev").waiting).toEqual(["over-6-months"]);
    expect(serializeFilters(parseFilters("cakanje=nad-3-leta,nad-1-leto"))).toBe("cakanje=nad-1-leto");
  });
});

// groupOptions hands every group a fixed catalogue regardless of what the
// animals passed in actually carry (coatLength always offers "hairless"),
// which is why Brez dlake sat on the panel as a permanent 0: no filter ever
// narrowed it there, the catalogue simply holds no such animal. liveInPool is
// the option-level filter that keeps a catalogue value off the panel unless
// the pool answers it at least once.
describe("liveInPool and poolCounts", () => {
  it("drops an option the species pool never answers, on the list a picker builds from", () => {
    const pool = [
      animal("a", { coatLength: "short" }),
      animal("b", { coatLength: "medium" }),
      animal("c", { coatLength: "long" }),
    ];
    const options = groupOptions("coatLength", pool, "sl");
    const counts = poolCounts(pool, now).coatLength;
    expect(liveInPool(options, counts, []).map((o) => o.value)).toEqual([
      "short",
      "medium",
      "long",
    ]);
  });

  it("keeps a selected option even though the pool never answers it, so it can be taken off", () => {
    const pool = [animal("a", { coatLength: "short" })];
    const options = groupOptions("coatLength", pool, "sl");
    const counts = poolCounts(pool, now).coatLength;
    expect(liveInPool(options, counts, ["hairless"]).map((o) => o.value)).toEqual([
      "short",
      "hairless",
    ]);
  });

  it("counts the species tab alone, not the filters currently narrowing it", () => {
    const pool = [
      animal("a", { species: "dog", sex: "male", coatColor: "black" }),
      animal("b", { species: "dog", sex: "female", coatColor: "white" }),
    ];
    // Narrowed to Samec on a different axis: the white female fails it, so
    // she drops out of every group's tally, coatColor included, the ordinary
    // reason a row goes dead (isDeadOption) and not why an option should
    // disappear from the list altogether. (coatColor's own filter cannot
    // demonstrate this: facetCounts lifts a group's own axis when counting
    // it, so a coatColor pick never zeroes another coatColor option.)
    const narrowed = facetCounts(pool, { ...EMPTY_FILTERS, species: "dog", sex: ["male"] }, now);
    expect(narrowed.coatColor.get("white") ?? 0).toBe(0);
    // The pool (species tab, nothing else applied) still has her, so
    // liveInPool keeps "white" for the picker to widen back to.
    const counts = poolCounts(pool, now).coatColor;
    expect(counts.get("white")).toBe(1);
    const options = groupOptions("coatColor", pool, "sl");
    expect(liveInPool(options, counts, []).map((o) => o.value)).toContain("white");
  });
});
