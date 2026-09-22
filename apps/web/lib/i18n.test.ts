import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { getMessages, translate } from "./i18n";
import { labelMessages } from "./label-messages";
import { pickerText } from "@/components/filters/location-picker/model";
import { portalText } from "@/components/portal/portal-text";
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
  stayStatement,
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

  // The footer takes the date as a prop and fills it here. The placeholder is
  // the contract between the two locales and the component, and a renamed one
  // fails silently: interpolate leaves an unmatched {name} in the sentence.
  it("fills the footer's freshness line in both locales", () => {
    expect(translate("sl", "footerUpdated", { date: "8. 9. 2026" })).toBe(
      "Seznam objavljen 8. 9. 2026. Čas preverjanja je naveden pri posamezni živali.",
    );
    expect(translate("en", "footerUpdated", { date: "8 September 2026" })).toBe(
      "List published 8 September 2026. Each animal shows when its source was checked.",
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
    expect(meta(animal, "sl")).toBe("Pes · starost\u00a01\u00a0leto");
    expect(meta(animal, "en")).toBe("Dog · 1\u00a0year\u00a0old");
  });

  it("derives card age from a known birth date", () => {
    const animal = {
      species: "cat",
      sex: "female",
      birthDate: "2024-05-07",
    } as Animal;
    const now = new Date("2026-08-18T00:00:00Z");

    expect(meta(animal, "sl", now)).toBe("Mačka · starost\u00a02\u00a0leti");
    expect(meta(animal, "en", now)).toBe("Cat · 2\u00a0years\u00a0old");
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

  // The quiet line is where the site states a wait in words, so it is where
  // ageLabel's Slovenian duals are checked.
  const stayLine = (intakeDate: string, locale: "sl" | "en", now: Date) =>
    stayStatement(
      { species: "cat", status: "available", intakeDate } as Animal,
      locale,
      now,
    )?.text;

  it("formats time in shelter with Slovenian duals", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(stayLine("2026-07-15", "sl", now)).toBe("V zavetišču: 1 mesec");
    expect(stayLine("2026-06-15", "sl", now)).toBe("V zavetišču: 2 meseca");
    expect(stayLine("2026-05-15", "sl", now)).toBe("V zavetišču: 3 meseci");
    expect(stayLine("2026-04-15", "sl", now)).toBe("V zavetišču: 4 meseci");
    expect(stayLine("2026-03-15", "sl", now)).toBe("V zavetišču: 5 mesecev");
    expect(stayLine("2024-08-15", "sl", now)).toBe("V zavetišču: 2 leti");
  });

  it("formats time in shelter in English", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(stayLine("2026-02-15", "en", now)).toBe("In the shelter: 6 months");
  });

  it("falls back to 'less than a month' just under the boundary", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(stayLine("2026-08-01", "sl", now)).toBe(
      "V zavetišču: manj kot mesec",
    );
  });

  it("says nothing for a future intake date", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(stayLine("2026-09-01", "sl", now)).toBeUndefined();
  });

  it("counts whole months in the shelter for the long-stay line", () => {
    const now = new Date("2026-08-18T00:00:00Z");

    expect(monthsInShelter("2026-08-01", now)).toBe(0);
    expect(monthsInShelter("2025-08-18", now)).toBe(12);
    expect(monthsInShelter("kmalu", now)).toBeUndefined();
    // A mistyped year puts the intake after the build. The month arithmetic
    // alone rounds a date later this month down to zero, which would state a
    // stay for an animal that by the record has not arrived.
    expect(monthsInShelter("2026-08-25", now)).toBeUndefined();
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

// One verb for every control that reveals a list. The site carried both
// "Pokaži" and "Prikaži" for the same press: the filter sheet's CTA, the
// shelter picker it opens and the grid's load-more button read as three
// different actions. Fixing today's instances does not stop the next string
// picking the other word, so the catalogues are walked.
//
// The imperative only. "Prikazane so živali ..." in the filter outcome lines
// is a participle reporting a result, not a control asking to be pressed, and
// the two are different parts of speech rather than drift.
describe("the Slovenian show verb", () => {
  // Both address forms: the public site would say "Prikaži" and the portal,
  // which speaks to shelter staff as "vi", "Prikažite". Same wrong verb.
  const SHOW_IMPERATIVE = /\bPrikaži(te)?\b/;

  const catalogues: [string, Record<string, unknown>][] = [
    ["lib/i18n.ts", getMessages("sl") as unknown as Record<string, unknown>],
    ["lib/label-messages.ts", labelMessages.sl],
    ["location-picker/model.ts", pickerText.sl],
    // Flat rather than keyed by locale: the portal is Slovenian only.
    ["portal/portal-text.ts", portalText],
  ];

  it.each(catalogues)("says Pokaži and never Prikaži in %s", (_name, catalogue) => {
    const offenders = Object.entries(catalogue)
      .filter(([, value]) => typeof value === "string" && SHOW_IMPERATIVE.test(value))
      .map(([key, value]) => `${key}: ${String(value)}`);

    expect(offenders).toEqual([]);
  });

  // The three presses that used to disagree, pinned as the strings a reader
  // actually meets rather than as the keys behind them.
  it("uses the one verb across the sheet, the picker and the grid", () => {
    const sl = getMessages("sl");
    expect(sl.show).toBe("Pokaži");
    expect(sl.showAnimals).toContain("Pokaži");
    expect(sl.showMoreAnimals).toContain("Pokaži");
  });
});
