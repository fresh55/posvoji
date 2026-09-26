import type { Animal } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { animalFields, type AnimalFields } from "@/lib/animal";
import {
  foldText,
  MAX_QUERY_LENGTH,
  rankBySearch,
  searchAnimals,
  tidyQuery,
  type DescriptionsById,
} from "./search";

function animal(
  id: string,
  fields: Partial<Pick<Animal, "name" | "breed" | "shortDescription" | "species">> = {},
): AnimalFields {
  return animalFields({
    id,
    source: {
      providerId: "muri",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "muri", name: "Shelter muri", city: "Ljubljana" },
    name: id,
    species: "dog",
    sex: "male",
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
    ...fields,
  });
}

const ids = (animals: readonly AnimalFields[]) => animals.map(({ id }) => id);

describe("tidyQuery", () => {
  it("trims the ends and makes every run of whitespace one space", () => {
    expect(tidyQuery("  Taras \t\n mirna  ")).toBe("Taras mirna");
    expect(tidyQuery("   ")).toBe("");
  });

  it("caps the query at the length the address carries", () => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 20);
    expect(tidyQuery(long)).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("cuts by character, so an emoji at the edge is not halved", () => {
    const query = `${"a".repeat(MAX_QUERY_LENGTH - 1)}🐶🐶`;
    const tidied = tidyQuery(query);
    expect(Array.from(tidied)).toHaveLength(MAX_QUERY_LENGTH);
    expect(tidied.endsWith("🐶")).toBe(true);
  });

  it("drops the space a cut lands after", () => {
    expect(tidyQuery(`${"a".repeat(MAX_QUERY_LENGTH - 1)} b`)).toBe(
      "a".repeat(MAX_QUERY_LENGTH - 1),
    );
  });
});

describe("foldText", () => {
  it("takes the accents off and lowercases", () => {
    expect(foldText("Ovčar ŠAPA žužek Ćiro")).toBe("ovcar sapa zuzek ciro");
  });

  it("maps đ, which NFD leaves whole, to d", () => {
    expect(foldText("Đurđica")).toBe("durdica");
  });
});

describe("searchAnimals", () => {
  const TARAS = animal("taras", { name: "Taras" });
  const OVCAR = animal("rex", { name: "Rex", breed: "nemški ovčar" });
  const ASCII = animal("bor", { name: "Bor", breed: "ovcar mix" });
  const HANA = animal("hana", { name: "Hana" });
  const ANAYA = animal("anaya", { name: "Anaya" });
  const MARJANA = animal("marjana", { name: "Marjana" });
  const DURDICA = animal("durdica", { name: "Đurđica", species: "cat" });
  const ALL = [TARAS, OVCAR, ASCII, HANA, ANAYA, MARJANA, DURDICA];

  it("hands back the list itself when there is nothing to find", () => {
    const search = searchAnimals(ALL, "");
    expect(search.found).toBe(ALL);
    expect(search.tiers.size).toBe(0);
    // Nothing but punctuation asks nothing either.
    expect(searchAnimals(ALL, "–!?").found).toBe(ALL);
  });

  it("finds a name however it is capitalised", () => {
    expect(ids(searchAnimals(ALL, "taras").found)).toEqual(["taras"]);
    expect(ids(searchAnimals(ALL, "TARAS").found)).toEqual(["taras"]);
  });

  it("matches with or without the accents, on either side", () => {
    // A keyboard without č finds the breed written with it, and a query with
    // it finds the breed a shelter wrote without.
    expect(ids(searchAnimals(ALL, "ovcar").found)).toEqual(["rex", "bor"]);
    expect(ids(searchAnimals(ALL, "ovčar").found)).toEqual(["rex", "bor"]);
    expect(ids(searchAnimals(ALL, "NEMSKI").found)).toEqual(["rex"]);
  });

  it("reads đ as d, and as itself", () => {
    expect(ids(searchAnimals(ALL, "durd").found)).toEqual(["durdica"]);
    expect(ids(searchAnimals(ALL, "Đurđ").found)).toEqual(["durdica"]);
  });

  it("finds a word by its start and not by its middle", () => {
    // "ana" is inside Hana and Marjana and begins Anaya.
    expect(ids(searchAnimals(ALL, "ana").found)).toEqual(["anaya"]);
    expect(ids(searchAnimals(ALL, "car").found)).toEqual([]);
  });

  it("asks every word of the query, each in any of the fields", () => {
    expect(ids(searchAnimals(ALL, "rex ovčar").found)).toEqual(["rex"]);
    expect(ids(searchAnimals(ALL, "ovčar mix").found)).toEqual(["bor"]);
    // One word found and one not is no match.
    expect(ids(searchAnimals(ALL, "taras ovčar").found)).toEqual([]);
  });

  it("splits names at hyphens and slashes, like any other text", () => {
    const pair = animal("zan", { name: "Žan-Žak", breed: "N. ovčarka / mešanka" });
    expect(ids(searchAnimals([pair], "zak").found)).toEqual(["zan"]);
    expect(ids(searchAnimals([pair], "mesan").found)).toEqual(["zan"]);
  });

  it("searches the descriptions once they have arrived", () => {
    const calm = animal("luna", { name: "Luna" });
    const list = [calm, TARAS];
    const descriptions: DescriptionsById = {
      luna: { description: "Mirna psička, ki rada leži na soncu." },
      taras: {},
    };

    // The grid's animals carry no description, so before the file is in the
    // word is nowhere to be found.
    expect(ids(searchAnimals(list, "mirna").found)).toEqual([]);
    expect(ids(searchAnimals(list, "mirna", descriptions).found)).toEqual([
      "luna",
    ]);
    // And it is searched like the rest: accents and word starts.
    expect(ids(searchAnimals(list, "psic sonc", descriptions).found)).toEqual([
      "luna",
    ]);
  });

  it("reads a description the animal carries itself", () => {
    const own = animal("own", { shortDescription: "Igriv mladič." });
    expect(ids(searchAnimals([own], "igriv").found)).toEqual(["own"]);
  });

  it("says where it found each animal, the best field first", () => {
    const named = animal("mirko", { name: "Mirko" });
    const bred = animal("pastir", { name: "Pastir", breed: "mirni ovčar" });
    const told = animal("ben", { name: "Ben" });
    const descriptions: DescriptionsById = {
      mirko: { description: "Miren pes." },
      ben: { description: "Miren in prijazen." },
    };
    const { tiers } = searchAnimals([named, bred, told], "mir", descriptions);
    expect(Object.fromEntries(tiers)).toEqual({
      mirko: "name",
      pastir: "breed",
      ben: "description",
    });
  });

  it("files an animal found by name under its name, whatever else was asked", () => {
    const taras = animal("taras", { name: "Taras" });
    const { tiers } = searchAnimals([taras], "taras miren", {
      taras: { description: "Zelo miren." },
    });
    expect(tiers.get("taras")).toBe("name");
  });

  it("reads each animal's words once per list, not once per query", () => {
    let reads = 0;
    const counted = {
      ...animal("taras", { name: "Taras" }),
      get name() {
        reads += 1;
        return "Taras";
      },
    };
    const list = [counted];

    searchAnimals(list, "t");
    searchAnimals(list, "ta");
    searchAnimals(list, "tar");

    expect(reads).toBe(1);
  });

  it("reads each loaded description once per load, not once per query", () => {
    let reads = 0;
    const descriptions: DescriptionsById = {
      taras: {
        get description() {
          reads += 1;
          return "Miren pes.";
        },
      },
    };
    const list = [animal("taras")];

    searchAnimals(list, "m", descriptions);
    searchAnimals(list, "mi", descriptions);
    searchAnimals(list, "mir", descriptions);

    expect(reads).toBe(1);
  });
});

describe("rankBySearch", () => {
  it("puts name matches first, then breed, then description, each in the order given", () => {
    const sorted = [
      animal("d1"),
      animal("b1"),
      animal("n1"),
      animal("d2"),
      animal("n2"),
      animal("b2"),
    ];
    const tiers = new Map([
      ["n1", "name"],
      ["n2", "name"],
      ["b1", "breed"],
      ["b2", "breed"],
      ["d1", "description"],
      ["d2", "description"],
    ] as const);

    expect(ids(rankBySearch(sorted, tiers))).toEqual([
      "n1",
      "n2",
      "b1",
      "b2",
      "d1",
      "d2",
    ]);
  });

  it("leaves the list as it is without a query", () => {
    const sorted = [animal("a"), animal("b")];
    expect(rankBySearch(sorted, new Map())).toBe(sorted);
  });
});
