import { describe, expect, it } from "vitest";
import type { Animal, AdoptionStatus, Species } from "@posvoji/schema";
import { summarizeShelters } from "./shelter-summary";

const NOW = new Date("2026-08-01T00:00:00Z");

function animal(
  id: string,
  shelterId: string,
  species: Species,
  extra: Partial<Pick<Animal, "intakeDate" | "name" | "status">> = {},
): Animal {
  return {
    id,
    source: {
      providerId: shelterId,
      sourceUrl: `https://example.org/${id}`,
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: shelterId, name: shelterId, city: "Celje" },
    species,
    status: (extra.status ?? "available") as AdoptionStatus,
    intakeDate: extra.intakeDate,
    name: extra.name,
    images: [],
    attribution: "Vir: test",
  };
}

describe("summarizeShelters", () => {
  it("counts every species the shelter has, in the site's own order", () => {
    const summaries = summarizeShelters(
      [
        animal("a", "jug", "cat"),
        animal("b", "jug", "dog"),
        animal("c", "jug", "dog"),
        animal("d", "sever", "rabbit"),
      ],
      "sl",
      NOW,
    );

    expect(summaries.get("jug")?.species).toEqual([
      { species: "dog", count: 2 },
      { species: "cat", count: 1 },
    ]);
    expect(summaries.get("sever")?.species).toEqual([
      { species: "rabbit", count: 1 },
    ]);
  });

  it("words the longest wait in the reader's language", () => {
    const summaries = summarizeShelters(
      [
        animal("a", "jug", "cat", { intakeDate: "2024-08-01", name: "Bine" }),
        animal("b", "jug", "cat", { intakeDate: "2016-08-01", name: "Mila" }),
      ],
      "sl",
      NOW,
    );

    expect(summaries.get("jug")?.longestWaiting).toEqual({
      name: "Mila",
      duration: "10 let",
    });
    expect(
      summarizeShelters(
        [animal("b", "jug", "cat", { intakeDate: "2016-08-01", name: "Mila" })],
        "en",
        NOW,
      ).get("jug")?.longestWaiting?.duration,
    ).toBe("10 years");
  });

  it("leaves out animals that are not waiting for the visitor", () => {
    const summaries = summarizeShelters(
      [
        animal("a", "jug", "cat", {
          intakeDate: "2010-08-01",
          name: "Posvojen",
          status: "adopted",
        }),
        animal("b", "jug", "cat", { intakeDate: "2024-08-01", name: "Bine" }),
      ],
      "sl",
      NOW,
    );

    // The adopted one waited longer, but its stay is history. It still counts
    // as a cat in the house.
    expect(summaries.get("jug")?.longestWaiting?.name).toBe("Bine");
    expect(summaries.get("jug")?.species).toEqual([
      { species: "cat", count: 2 },
    ]);
  });

  it("says nothing about a wait when no animal carries an intake date", () => {
    const summaries = summarizeShelters([animal("a", "jug", "dog")], "sl", NOW);

    expect(summaries.get("jug")?.longestWaiting).toBeUndefined();
  });

  it("names an unnamed animal the way the rest of the site does", () => {
    const summaries = summarizeShelters(
      [animal("a", "jug", "dog", { intakeDate: "2020-08-01" })],
      "sl",
      NOW,
    );

    expect(summaries.get("jug")?.longestWaiting?.name).toBe("Brez imena");
  });
});
