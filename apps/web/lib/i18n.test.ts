import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { translate } from "./i18n";
import { groupLabel, groupOptions, toggleLabel } from "./filters";
import {
  allShelters,
  animalCount,
  animalMeta,
  shelterCount,
  sheltersMissingFromMap,
} from "./labels";

describe("translations", () => {
  it("interpolates translated messages", () => {
    expect(translate("en", "selectedShelters", { selected: 2, total: 7 })).toBe(
      "2 of 7 shelters",
    );
  });
});

describe("localized labels", () => {
  it("formats English counts without Slovenian dual forms", () => {
    expect(animalCount(1, "en")).toBe("1 animal");
    expect(animalCount(2, "en")).toBe("2 animals");
    expect(shelterCount(1, "en")).toBe("1 shelter");
    expect(allShelters(4, "en")).toBe("All 4 shelters");
    expect(sheltersMissingFromMap(2, "sl")).toBe(
      "2 zavetišči nista na zemljevidu.",
    );
  });

  it("uses natural Slovenian wording for all shelters", () => {
    expect(allShelters(1, "sl")).toBe("Edino zavetišče");
    expect(allShelters(2, "sl")).toBe("Obe zavetišči");
    expect(allShelters(3, "sl")).toBe("Vsa 3 zavetišča");
    expect(allShelters(5, "sl")).toBe("Vseh 5 zavetišč");
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

  it("translates filter choices", () => {
    expect(groupLabel("age", "en")).toBe("Age");
    expect(groupOptions("size", [], "en").map((option) => option.label)).toEqual([
      "Small",
      "Medium",
      "Large",
    ]);
    expect(toggleLabel("cepljenje", "en")).toBe("Vaccinated");
  });
});
