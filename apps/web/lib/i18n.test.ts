import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { translate } from "./i18n";
import { groupLabel, groupOptions, toggleLabel } from "./filters";
import {
  allShelters,
  animalCount,
  animalMetaParts,
  META_SEPARATOR,
  monthsInShelter,
  shelterCount,
  sheltersMissingFromMap,
  speciesLabel,
  statusLabel,
  timeInShelter,
} from "./labels";

// The card renders these parts separately so it can dim the separators; joined
// is the form a reader checks a translation against.
const meta = (animal: Animal, locale: "sl" | "en", now?: Date) =>
  animalMetaParts(animal, locale, now).join(META_SEPARATOR);

describe("translations", () => {
  it("interpolates translated messages", () => {
    expect(translate("en", "photoCount", { current: 2, total: 7 })).toBe(
      "Photo 2 of 7",
    );
  });

  it("agrees the shelter-absence sentence with the Slovenian dual", () => {
    // One zavetišče nima, two zavetišči nimata, three or more zavetišča
    // nimajo. Two is the count a singular/plural pair gets wrong.
    expect(
      translate("sl", "noResultsShelterSingular", { species: "psov" }),
    ).toBe("Izbrano zavetišče trenutno nima psov.");
    expect(translate("sl", "noResultsShelterDual", { species: "psov" })).toBe(
      "Izbrani zavetišči trenutno nimata psov.",
    );
    expect(translate("sl", "noResultsShelterPlural", { species: "psov" })).toBe(
      "Izbrana zavetišča trenutno nimajo psov.",
    );
    // English inflects nothing past one, so the dual reads as the plural
    // rather than as a form of its own.
    expect(translate("en", "noResultsShelterDual", { species: "dogs" })).toBe(
      translate("en", "noResultsShelterPlural", { species: "dogs" }),
    );
  });
});

describe("localized labels", () => {
  it("formats English counts without Slovenian dual forms", () => {
    expect(animalCount(1, "en")).toBe("1 animal");
    expect(animalCount(2, "en")).toBe("2 animals");
    expect(shelterCount(1, "en")).toBe("1 shelter");
    expect(allShelters("en")).toBe("All shelters");
    expect(sheltersMissingFromMap(2, "sl")).toBe(
      "2 zavetišči nista na zemljevidu.",
    );
  });

  it("names the shelter picker's roster without a count", () => {
    expect(allShelters("sl")).toBe("Vsa zavetišča");
    expect(allShelters("en")).toBe("All shelters");
  });

  it("formats animal metadata in the selected language", () => {
    const animal = {
      species: "dog",
      sex: "female",
      approximateAgeMonths: 18,
    } as Animal;

    // The fixture carries a sex and the line does not: two facts is all the
    // card's width buys, so the sex reads on the animal's own page instead.
    expect(meta(animal, "sl")).toBe("Pes · 1 leto");
    expect(meta(animal, "en")).toBe("Dog · 1 year");
  });

  it("derives card age from a known birth date", () => {
    const animal = {
      species: "cat",
      sex: "female",
      birthDate: "2024-05-07",
    } as Animal;
    const now = new Date("2026-08-18T00:00:00Z");

    expect(meta(animal, "sl", now)).toBe("Mačka · 2 leti");
    expect(meta(animal, "en", now)).toBe("Cat · 2 years");
  });

  it("translates filter choices", () => {
    expect(groupLabel("age", "en")).toBe("Age");
    expect(groupOptions("size", [], "en").map((option) => option.label)).toEqual([
      "Small",
      "Medium",
      "Large",
    ]);
    expect(toggleLabel("cepljenje", "en")).toBe("Vaccinated");
  });

  it("translates the energija group and its options", () => {
    expect(groupLabel("energy", "sl")).toBe("Energija");
    expect(groupLabel("energy", "en")).toBe("Energy");
    expect(
      groupOptions("energy", [], "sl").map((option) => option.label),
    ).toEqual(["Miren", "Uravnotežen", "Živahen"]);
    expect(
      groupOptions("energy", [], "en").map((option) => option.label),
    ).toEqual(["Calm", "Balanced", "Lively"]);
  });

  it("formats time in shelter with Slovenian duals", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(timeInShelter("2026-07-15", "sl", now)).toBe("1 mesec");
    expect(timeInShelter("2026-06-15", "sl", now)).toBe("2 meseca");
    expect(timeInShelter("2026-05-15", "sl", now)).toBe("3 meseci");
    expect(timeInShelter("2026-04-15", "sl", now)).toBe("4 meseci");
    expect(timeInShelter("2026-03-15", "sl", now)).toBe("5 mesecev");
    expect(timeInShelter("2024-08-15", "sl", now)).toBe("2 leti");
  });

  it("formats time in shelter in English", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(timeInShelter("2026-02-15", "en", now)).toBe("6 months");
  });

  it("falls back to 'less than a month' just under the boundary", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(timeInShelter("2026-08-01", "sl", now)).toBe("manj kot mesec");
  });

  it("returns undefined for a future intake date", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(timeInShelter("2026-09-01", "sl", now)).toBeUndefined();
  });

  it("counts whole months in the shelter for the long-stay line", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(monthsInShelter("2026-08-01", now)).toBe(0);
    expect(monthsInShelter("2025-08-18", now)).toBe(12);
    expect(monthsInShelter("kmalu", now)).toBeUndefined();
  });

  it("names the species on its own", () => {
    expect(speciesLabel("cat", "sl")).toBe("Mačka");
    expect(speciesLabel("dog", "en")).toBe("Dog");
  });

  it("translates adoption status", () => {
    expect(statusLabel("available", "sl")).toBe("na voljo");
    expect(statusLabel("adopted", "en")).toBe("adopted");
    expect(statusLabel("unknown", "sl")).toBeUndefined();
  });
});
