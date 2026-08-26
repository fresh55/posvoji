import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { translate } from "./i18n";
import { groupLabel, groupOptions, toggleLabel } from "./filters";
import {
  allShelters,
  animalCount,
  animalMeta,
  monthsInShelter,
  shelterCount,
  sheltersMissingFromMap,
  speciesLabel,
  statusLabel,
  timeInShelter,
} from "./labels";

describe("translations", () => {
  it("interpolates translated messages", () => {
    expect(translate("en", "photoCount", { current: 2, total: 7 })).toBe(
      "Photo 2 of 7",
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

    expect(animalMeta(animal, "sl")).toBe("Pes · samica · 1 leto");
    expect(animalMeta(animal, "en")).toBe("Dog · female · 1 year");
  });

  it("derives card age from a known birth date", () => {
    const animal = {
      species: "cat",
      sex: "female",
      birthDate: "2024-05-07",
    } as Animal;
    const now = new Date("2026-08-18T00:00:00Z");

    expect(animalMeta(animal, "sl", now)).toBe("Mačka · samica · 2 leti");
    expect(animalMeta(animal, "en", now)).toBe("Cat · female · 2 years");
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
