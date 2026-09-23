import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  ageLabel,
  animalMetaParts,
  LONG_STAY_MONTHS,
  META_SEPARATOR,
  longStayMonths,
  registerDateLabel,
  shelterChipLabel,
  shelterListLabel,
  shelterSelectionLabel,
} from "./labels";

const NOW = new Date("2026-08-15T00:00:00Z");

describe("ageLabel's separator", () => {
  // The card welds the number to its unit because its column is 164px wide on
  // a phone. The rule belongs to whoever writes the join, so the number and
  // the unit are never taken apart again to change the character between them.
  it("puts the caller's separator between the number and the unit", () => {
    expect(ageLabel(24, "sl", "\u00a0")).toBe("2\u00a0leti");
    expect(ageLabel(10, "sl", "\u00a0")).toBe("10\u00a0mesecev");
    expect(ageLabel(24, "en", "\u00a0")).toBe("2\u00a0years");
  });

  it("leaves every other caller the plain space", () => {
    expect(ageLabel(24, "sl")).toBe("2 leti");
    expect(ageLabel(10, "en")).toBe("10 months");
  });

  // "manj kot mesec" carries no numeral, so there is nothing to weld and the
  // phrase stays free to wrap.
  it("ignores the separator where the label has no number", () => {
    expect(ageLabel(0, "sl", "\u00a0")).toBe("manj kot mesec");
    expect(ageLabel(0, "en", "\u00a0")).toBe("less than a month");
  });
});

describe("shelterSelectionLabel", () => {
  it("names the unrestricted selection in either language", () => {
    expect(shelterSelectionLabel([], "sl")).toBe("Vsa zavetišča");
    expect(shelterSelectionLabel([], "en")).toBe("All shelters");
  });

  it("keeps the selected shelter's complete name in either language", () => {
    const selection = [{ label: "Zavetišče Ljubljana" }];
    expect(shelterSelectionLabel(selection, "sl")).toBe("Zavetišče Ljubljana");
    expect(shelterSelectionLabel(selection, "en")).toBe("Zavetišče Ljubljana");
  });

  it("counts multiple choices explicitly without a registry fraction", () => {
    const selection = [{ label: "Sever" }, { label: "Jug" }];
    expect(shelterSelectionLabel(selection, "sl")).toBe("Izbrano: 2");
    expect(shelterSelectionLabel(selection, "en")).toBe("Selected: 2");
  });
});

function animal(extra: Partial<Animal> = {}): Animal {
  return {
    id: "a1",
    source: {
      providerId: "zavetisce",
      sourceUrl: "https://example.org/zival",
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: "s1", name: "Zavetišče", city: "Ljubljana" },
    species: "rabbit",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...extra,
  };
}

describe("the card's meta line on the species tabs", () => {
  // The joined form, which is what a reader checks these against. The card
  // itself renders the parts so it can dim the separators.
  const meta = (
    subject: Animal,
    locale: Parameters<typeof animalMetaParts>[1],
    species: Parameters<typeof animalMetaParts>[3],
  ) => animalMetaParts(subject, locale, NOW, species).join(META_SEPARATOR);

  // Every fixture here carries a sex, which is what makes these exact strings
  // prove the line leaves it out: two facts is all the card's width buys.
  //
  // The \u00a0 is the card's own: it ties the age's number to its unit so the
  // line never breaks between them.
  const rabbit = animal({ sex: "female", approximateAgeMonths: 24 });

  it("drops the species word only on a tab that names one species", () => {
    expect(meta(rabbit, "sl", "all")).toBe("Zajček · starost\u00a02\u00a0leti");
    // The merged Ostale tab holds rabbits and whatever else, so the line
    // still has to say which animal this is.
    expect(meta(rabbit, "sl", "other")).toBe("Zajček · starost\u00a02\u00a0leti");
    const cat = animal({
      species: "cat",
      sex: "female",
      approximateAgeMonths: 24,
      size: "medium",
    });
    expect(meta(cat, "sl", "cat")).toBe("starost\u00a02\u00a0leti · srednja");
  });

  it("names the species and the age in English too", () => {
    const dog = animal({
      species: "dog",
      sex: "male",
      approximateAgeMonths: 36,
    });
    expect(meta(dog, "en", "all")).toBe("Dog · 3\u00a0years\u00a0old");
  });

  // A missing age used to leave the card reading "Mačka" on its own, which
  // looks like something failed to load. The slot falls through to the next
  // fact we know instead.
  it("fills an unknown age with the next fact it knows", () => {
    const cat = animal({ species: "cat", sex: "female", size: "medium" });
    expect(meta(cat, "sl", "all")).toBe("Mačka · srednja");
    expect(meta(cat, "sl", "cat")).toBe("srednja · samica");
  });

  it("reaches sex only when nothing above it is known", () => {
    const cat = animal({ species: "cat", sex: "female" });
    expect(meta(cat, "sl", "all")).toBe("Mačka · samica");
    expect(meta(cat, "sl", "cat")).toBe("samica");
  });

  // Nothing invented to fill the second slot: a line of one fact is what an
  // animal we know one fact about gets, and on a named tab that is no line.
  it("says only what it knows", () => {
    const cat = animal({ species: "cat" });
    expect(meta(cat, "sl", "all")).toBe("Mačka");
    expect(meta(cat, "sl", "cat")).toBe("");
    expect(animalMetaParts(cat, "sl", NOW, "cat")).toEqual([]);
  });

  // An unknown sex is not a fact, so it does not take the slot a real one
  // would.
  it("treats an unknown sex as nothing to say", () => {
    const cat = animal({ species: "cat", sex: "unknown" });
    expect(meta(cat, "sl", "all")).toBe("Mačka");
  });

  // Three facts on the line is the thing the limit exists to stop: at 375px a
  // third wrapped onto a second line and made the whole grid row taller.
  it("never prints more than two facts", () => {
    const dog = animal({
      species: "dog",
      sex: "male",
      size: "large",
      approximateAgeMonths: 36,
    });
    expect(animalMetaParts(dog, "sl", NOW, "all")).toHaveLength(2);
    expect(animalMetaParts(dog, "sl", NOW, "dog")).toHaveLength(2);
    expect(meta(dog, "sl", "dog")).toBe("starost\u00a03\u00a0leta · velika");
  });
});

describe("longStayMonths", () => {
  // Months, as an intake date this many whole months before NOW.
  function intake(months: number): string {
    const date = new Date(NOW);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
  }

  it("starts at the long-stay threshold and keeps counting past it", () => {
    expect(
      longStayMonths(animal({ intakeDate: intake(LONG_STAY_MONTHS - 1) }), NOW),
    ).toBeUndefined();
    expect(
      longStayMonths(animal({ intakeDate: intake(LONG_STAY_MONTHS) }), NOW),
    ).toBe(LONG_STAY_MONTHS);
    expect(
      longStayMonths(animal({ intakeDate: intake(LONG_STAY_MONTHS * 2) }), NOW),
    ).toBe(LONG_STAY_MONTHS * 2);
  });

  it("says nothing about an animal the visitor cannot act on", () => {
    expect(
      longStayMonths(
        animal({ intakeDate: intake(72), status: "adopted" }),
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe("registerDateLabel", () => {
  // The string lands in "..., stanje {date}.", where Slovenian wants the
  // genitive "23. februarja 2026". Intl has no genitive month and dateStyle
  // "long" gave the nominative "23. februar 2026", so the sentence was
  // ungrammatical on the index and on all seventeen shelter pages. A numeric
  // date carries no case.
  it("prints a Slovenian date the provenance line can hold", () => {
    expect(registerDateLabel("2026-02-23", "sl")).toBe("23. 2. 2026");
    expect(registerDateLabel("2026-02-23", "sl")).not.toContain("februar");
  });

  // English reads naturally in the long form after "as of", and it is the
  // only other place this string appears.
  it("keeps the English long form", () => {
    expect(registerDateLabel("2026-02-23", "en")).toBe("23 February 2026");
  });

  // Read as UTC either way: a date-only string parses as UTC midnight, and
  // reading it locally moves it into the previous day west of Greenwich.
  it("prints an unparseable value as it was written", () => {
    expect(registerDateLabel("kmalu", "sl")).toBe("kmalu");
  });
});

describe("shelterListLabel", () => {
  it("drops the operator in brackets and keeps the rest of the name", () => {
    expect(shelterListLabel("Obalno zavetišče (Marjetica Koper)")).toBe(
      "Obalno zavetišče",
    );
    expect(shelterListLabel("Zavetišče Maribor (Snaga)")).toBe(
      "Zavetišče Maribor",
    );
    expect(shelterListLabel("Zavetišče Ljubljana")).toBe("Zavetišče Ljubljana");
  });

  it("keeps a name that would be a fragment without its bracket", () => {
    expect(shelterListLabel("AB (Društvo)")).toBe("AB (Društvo)");
  });
});

describe("shelterChipLabel", () => {
  it("drops the noun every shelter shares when it opens the name", () => {
    // Five of the registry's shelters open with this word. On a 390px phone
    // the pill was 180px, half the row, and truncation cuts from the right:
    // it kept "Zavetišče Mala…" and threw away the half that says which one.
    expect(shelterChipLabel("Zavetišče Mala hiša")).toBe("Mala hiša");
  });

  it("drops a trailing operator parenthetical", () => {
    // The parenthetical names the company behind the shelter, not the
    // shelter, and it is what pushed these names onto a second line.
    expect(shelterChipLabel("Zavetišče Maribor (Snaga)")).toBe("Maribor");
    expect(shelterChipLabel("Zavetišče Johanca (Veterina Tolmin)")).toBe(
      "Johanca",
    );
  });

  it("drops it where it trails the name, separator and all", () => {
    expect(shelterChipLabel("Veterinarska bolnica Brežice — zavetišče")).toBe(
      "Veterinarska bolnica Brežice",
    );
    expect(shelterChipLabel("Veterina Sevnica — zavetišče")).toBe(
      "Veterina Sevnica",
    );
  });

  it("keeps the noun that heads a phrase rather than a name", () => {
    // A municipal shelter is often named for its remit. Taking the noun off
    // the front of that leaves the remit hanging off nothing: "za zapuščene
    // živali Gorenjske in Notranjske" is not a name anybody would recognise.
    expect(
      shelterChipLabel(
        "Zavetišče za zapuščene živali Gorenjske in Notranjske (Občina Kranj)",
      ),
    ).toBe("Zavetišče za zapuščene živali Gorenjske in Notranjske");
    expect(shelterChipLabel("zavetišče v Trbovljah")).toBe(
      "zavetišče v Trbovljah",
    );
  });

  it("keeps a noun the name cannot stand without", () => {
    // The adjective in front is what distinguishes this one, so the noun is
    // load-bearing where it sits; only the operator comes off.
    expect(shelterChipLabel("Obalno zavetišče (Marjetica Koper)")).toBe(
      "Obalno zavetišče",
    );
  });

  it("leaves names that never carry it alone", () => {
    expect(shelterChipLabel("Meli Center Repče")).toBe("Meli Center Repče");
    expect(shelterChipLabel("Zavod Muri")).toBe("Zavod Muri");
  });

  it("keeps the whole name rather than returning a fragment", () => {
    expect(shelterChipLabel("Zavetišče")).toBe("Zavetišče");
    expect(shelterChipLabel("Zavetišče Ob")).toBe("Zavetišče Ob");
  });

  it("keeps the operator strip when only the noun strip would leave a fragment", () => {
    // The two strips are guarded separately. Together, a name whose noun strip
    // leaves "Ob" fell all the way back to the raw name and got its operator
    // parenthetical back with it, which neither strip promises.
    expect(shelterChipLabel("Zavetišče Ob (Snaga)")).toBe("Zavetišče Ob");
  });
});

// Seven listings in the dataset cover more than one animal, and the card has
// one age, one size and one sex to give for all of them. The dialog and the
// page withhold those and let the shelter's description answer instead; the
// card has no description under it, so it says what it has instead of falling
// through to the next single-animal fact.
describe("the card's meta line for a listing covering several animals", () => {
  const meta = (
    subject: Animal,
    locale: Parameters<typeof animalMetaParts>[1],
    species: Parameters<typeof animalMetaParts>[3],
  ) => animalMetaParts(subject, locale, NOW, species).join(META_SEPARATOR);

  const three = animal({
    name: "Disel, Lyann, Luna",
    species: "dog",
    sex: "female",
    approximateAgeMonths: 84,
    size: "medium",
  });

  it("replaces the age, the size and the sex rather than joining them", () => {
    expect(meta(three, "sl", "all")).toBe("Pes · več živali");
    expect(meta(three, "en", "all")).toBe("Dog · several animals");
  });

  // On a species tab the species word comes off the front, so this is the
  // whole line. A bare number there would have read as one animal's age.
  it("stands alone on a tab that has already named the species", () => {
    expect(meta(three, "sl", "dog")).toBe("več živali");
  });

  it("reads a pair joined by in and a collective the same way", () => {
    expect(meta(animal({ name: "Bria in Brin", species: "cat" }), "sl", "cat"))
      .toBe("več živali");
    expect(
      meta(animal({ name: "Božanska družina", species: "cat" }), "sl", "cat"),
    ).toBe("več živali");
  });

  // The guard the rule is worth having: an ordinary two-word name is one
  // animal, and so is a description that happens to contain the word "in".
  it("leaves a single animal's own facts alone", () => {
    const one = animal({
      name: "Peter Zajec",
      species: "dog",
      approximateAgeMonths: 24,
    });
    expect(meta(one, "sl", "dog")).toBe("starost\u00a02 leti");
    const tritta = animal({
      name: "triinpoltačka Tritta",
      species: "cat",
      approximateAgeMonths: 24,
    });
    expect(meta(tritta, "sl", "cat")).toBe("starost\u00a02 leti");
  });
});
