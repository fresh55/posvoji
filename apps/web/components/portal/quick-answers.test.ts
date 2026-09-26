import { describe, expect, it } from "vitest";
import type { Animal, Species } from "@posvoji/schema";
import {
  QUICK_QUESTIONS,
  UNKNOWN,
  answerPatch,
  asksSize,
  missingAnswers,
  needsAnswers,
  nextOpen,
  resumeRound,
  roundOf,
  unknownNote,
  type QuickRecord,
} from "@/components/portal/quick-answers";
import { EMPTY_FILTERS, unansweredCounts } from "@/lib/filters";
import { PORTAL_SPECIES } from "@/lib/portal-api";

function record(over: Partial<QuickRecord> = {}): QuickRecord {
  return {
    id: "testno:1",
    name: "Rex",
    species: "dog",
    status: "available",
    breed: null,
    sex: null,
    birthDate: null,
    approximateAgeMonths: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    size: null,
    energy: null,
    ...over,
  };
}

const ANSWERED: Partial<QuickRecord> = {
  goodWithKids: "yes",
  goodWithDogs: "no",
  goodWithCats: "unknown",
  size: "small",
  energy: "calm",
};

// The page asks what the public site filters by, so the two have to agree on
// who is asked what. The site's rule lives in lib/filters/engine.ts, and its
// unanswered tally is where it says whom a question is put to.
describe("the questions agree with the public filters", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const unanswered = (species: Species): Animal => ({
    id: `a-${species}`,
    species,
    status: "available",
    images: [],
    attribution: "Fixture",
    source: {
      providerId: "fixture",
      sourceUrl: "https://example.test/animal",
      fetchedAt: now.toISOString(),
      firstSeenAt: "2020-01-01T00:00:00Z",
      lastSeenAt: now.toISOString(),
    },
    shelter: { id: "fixture", name: "Fixture", city: "Ljubljana" },
  });

  it.each(PORTAL_SPECIES)("asks a %s its size exactly when the site does", (species) => {
    const tally = unansweredCounts([unanswered(species)], EMPTY_FILTERS, now);

    expect(asksSize(species)).toBe(tally.groups.size.asked === 1);
  });

  it.each(PORTAL_SPECIES)("asks a %s the other four, as the site does", (species) => {
    const tally = unansweredCounts([unanswered(species)], EMPTY_FILTERS, now);

    expect(tally.groups.energy.asked).toBe(1);
    expect(tally.goodWith.kids.asked).toBe(1);
    expect(tally.goodWith.dogs.asked).toBe(1);
    expect(tally.goodWith.cats.asked).toBe(1);
  });

  it("ends every question with Ne vem", () => {
    for (const question of QUICK_QUESTIONS) {
      expect(question.options.at(-1)).toBe(UNKNOWN);
    }
  });
});

describe("what is still missing", () => {
  it("counts a cat with the other four answers as done", () => {
    const cat = record({ species: "cat", ...ANSWERED, size: null });

    expect(missingAnswers(cat)).toEqual([]);
    expect(needsAnswers(cat)).toBe(false);
  });

  it("asks a dog its size", () => {
    expect(missingAnswers(record({ ...ANSWERED, size: null }))).toEqual(["size"]);
  });

  it("takes a stored unknown as an answer", () => {
    expect(missingAnswers(record({ ...ANSWERED, goodWithKids: "unknown" }))).toEqual([]);
  });

  it("never asks an animal that has gone home", () => {
    expect(needsAnswers(record({ status: "adopted" }))).toBe(false);
    expect(needsAnswers(record({ status: "hold" }))).toBe(true);
  });
});

describe("a round", () => {
  const records = [
    record({ id: "a" }),
    record({ id: "b", ...ANSWERED }),
    record({ id: "c" }),
  ];
  const byId = new Map(records.map((one) => [one.id, one]));

  it("holds the open animals in the list's order", () => {
    expect(roundOf(records, null)).toEqual(["a", "c"]);
  });

  it("holds the animal the address names, answered or not", () => {
    expect(roundOf(records, "b")).toEqual(["a", "b", "c"]);
  });

  it("resumes the stored round only when the address is inside it", () => {
    expect(resumeRound(["x", "a", "b", "c"], records, "b")).toEqual(["a", "b", "c"]);
    expect(resumeRound(["a", "c"], records, "b")).toEqual(["a", "b", "c"]);
    expect(resumeRound(["a", "b", "c"], records, null)).toEqual(["a", "c"]);
  });

  it("steps over what is answered and stops at the end", () => {
    const round = ["a", "b", "c"];

    expect(nextOpen(round, -1, byId)).toBe(0);
    expect(nextOpen(round, 0, byId)).toBe(2);
    expect(nextOpen(round, 2, byId)).toBe(-1);
  });
});

describe("what a tap sends", () => {
  it("never sends Ne vem as a value, on any question", () => {
    for (const question of QUICK_QUESTIONS) {
      expect(answerPatch(record(), question.field, UNKNOWN, false)).toBeNull();
    }
    expect(answerPatch(record({ goodWithKids: "yes" }), "goodWithKids", UNKNOWN, false)).toBeNull();
  });

  it("takes the shelter's own answer back on Ne vem", () => {
    expect(answerPatch(record({ goodWithKids: "yes" }), "goodWithKids", UNKNOWN, true)).toEqual({
      goodWithKids: null,
    });
  });

  it("sends nothing for the answer that is already there", () => {
    expect(answerPatch(record({ goodWithDogs: "no" }), "goodWithDogs", "no", false)).toBeNull();
    expect(answerPatch(record({ size: "large" }), "size", "large", true)).toBeNull();
  });

  it("sends a size or an energy as it is", () => {
    expect(answerPatch(record(), "size", "medium", false)).toEqual({ size: "medium" });
    expect(answerPatch(record(), "energy", "lively", false)).toEqual({ energy: "lively" });
  });

  it("takes the shelter's own size back on Ne vem, and leaves the crawl's alone", () => {
    expect(answerPatch(record({ size: "large" }), "size", UNKNOWN, true)).toEqual({ size: null });
    expect(answerPatch(record({ size: "large" }), "size", UNKNOWN, false)).toBeNull();
    expect(answerPatch(record(), "energy", UNKNOWN, false)).toBeNull();
  });

  it("refuses a value that is not one of the field's answers", () => {
    expect(answerPatch(record(), "energy", "yes", false)).toBeNull();
    expect(answerPatch(record(), "goodWithCats", "small", false)).toBeNull();
  });
});

describe("the note under Ne vem", () => {
  it("says an empty answer stays open", () => {
    expect(unknownNote(record(), "size", false, true)).toBe("open");
    expect(unknownNote(record(), "goodWithKids", false, true)).toBe("open");
  });

  it("says a crawled answer stays, and why", () => {
    expect(unknownNote(record({ size: "medium" }), "size", false, true)).toBe("public");
    expect(unknownNote(record({ goodWithCats: "yes" }), "goodWithCats", false, true)).toBe("public");
  });

  it("says nothing before Ne vem, or over a stored unknown", () => {
    expect(unknownNote(record(), "energy", false, false)).toBeNull();
    expect(unknownNote(record({ goodWithDogs: "unknown" }), "goodWithDogs", false, true)).toBeNull();
  });
});
