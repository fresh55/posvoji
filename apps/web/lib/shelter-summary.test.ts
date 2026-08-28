import { describe, expect, it } from "vitest";
import type { Animal, AdoptionStatus, Species } from "@posvoji/schema";
import type { ClientAnimal } from "./animal";
import { animalsForClient } from "./dataset";
import { summarizeShelters } from "./shelter-summary";

const NOW = new Date("2026-08-01T00:00:00Z");

function animal(
  id: string,
  shelterId: string,
  species: Species,
  extra: Partial<
    Pick<Animal, "intakeDate" | "name" | "status" | "images">
  > = {},
): ClientAnimal {
  // Through the projection the grid is handed, because that is where a photo
  // stops being a set of rights and becomes the file a face is drawn from.
  return animalsForClient([
    {
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
      images: extra.images ?? [],
      attribution: "Vir: test",
    },
  ])[0]!;
}

// A single photo the shelter granted display rights to, which resolves to the
// shelter's own file.
function photo(id: string): Animal["images"] {
  return [{ sourceUrl: `https://example.org/${id}.jpg`, rights: "display-permitted" }];
}

// One the shelter granted nothing for. No surface draws it, so no face either.
function privatePhoto(id: string): Animal["images"] {
  return [{ sourceUrl: `https://example.org/${id}.jpg`, rights: "unknown" }];
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

  describe("faces", () => {
    it("leads with the longest-waiting animal's own photo", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "cat", {
            intakeDate: "2024-08-01",
            name: "Bine",
            images: photo("a"),
          }),
          animal("b", "jug", "cat", {
            intakeDate: "2016-08-01",
            name: "Mila",
            images: photo("b"),
          }),
        ],
        "sl",
        NOW,
      );

      // Mila is the longestWaiting animal, and her photo leads the fan.
      expect(summaries.get("jug")?.longestWaiting?.name).toBe("Mila");
      expect(summaries.get("jug")?.faces?.[0]).toEqual({
        name: "Mila",
        src: "https://example.org/b.jpg",
      });
      expect(summaries.get("jug")?.faces?.[1]).toEqual({
        name: "Bine",
        src: "https://example.org/a.jpg",
      });
    });

    it("skips an animal with no photo, whatever its wait", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "cat", {
            intakeDate: "2016-08-01",
            name: "Mila",
          }),
          animal("b", "jug", "cat", {
            intakeDate: "2024-08-01",
            name: "Bine",
            images: photo("b"),
          }),
        ],
        "sl",
        NOW,
      );

      // Mila waited longer and is still named by longestWaiting, but has
      // nothing to put in the fan, so it opens with Bine instead.
      expect(summaries.get("jug")?.longestWaiting?.name).toBe("Mila");
      expect(summaries.get("jug")?.faces).toEqual([
        { name: "Bine", src: "https://example.org/b.jpg" },
      ]);
    });

    it("caps the fan at three, longer waits first", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "dog", {
            intakeDate: "2020-08-01",
            name: "A",
            images: photo("a"),
          }),
          animal("b", "jug", "dog", {
            intakeDate: "2021-08-01",
            name: "B",
            images: photo("b"),
          }),
          animal("c", "jug", "dog", {
            intakeDate: "2022-08-01",
            name: "C",
            images: photo("c"),
          }),
          animal("d", "jug", "dog", {
            intakeDate: "2023-08-01",
            name: "D",
            images: photo("d"),
          }),
        ],
        "sl",
        NOW,
      );

      expect(summaries.get("jug")?.faces?.map((face) => face.name)).toEqual([
        "A",
        "B",
        "C",
      ]);
    });

    it("fills remaining slots from animals with no known wait, but after every known one", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "dog", { name: "Nobody knows", images: photo("a") }),
          animal("b", "jug", "dog", {
            intakeDate: "2024-08-01",
            name: "Known",
            images: photo("b"),
          }),
        ],
        "sl",
        NOW,
      );

      expect(summaries.get("jug")?.faces?.map((face) => face.name)).toEqual([
        "Known",
        "Nobody knows",
      ]);
    });

    it("leaves out an animal that is not waiting for the visitor, photo or not", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "cat", {
            intakeDate: "2010-08-01",
            name: "Posvojen",
            status: "adopted",
            images: photo("a"),
          }),
          animal("b", "jug", "cat", {
            intakeDate: "2024-08-01",
            name: "Bine",
            images: photo("b"),
          }),
        ],
        "sl",
        NOW,
      );

      expect(summaries.get("jug")?.faces?.map((face) => face.name)).toEqual([
        "Bine",
      ]);
    });

    it("says nothing about an animal whose photo may not be drawn", () => {
      const summaries = summarizeShelters(
        [
          animal("a", "jug", "dog", {
            intakeDate: "2020-08-01",
            name: "A",
            images: privatePhoto("a"),
          }),
        ],
        "sl",
        NOW,
      );

      // The photo exists in the dataset and no surface on the site may draw
      // it, so it is gone before this is asked, the same as everywhere else.
      expect(summaries.get("jug")?.faces).toBeUndefined();
    });

    it("says nothing when nobody at the shelter has a photo", () => {
      const summaries = summarizeShelters(
        [animal("a", "jug", "dog", { intakeDate: "2020-08-01", name: "A" })],
        "sl",
        NOW,
      );

      expect(summaries.get("jug")?.faces).toBeUndefined();
    });
  });
});
