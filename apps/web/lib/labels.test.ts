import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  animalMeta,
  LONG_STAY_MONTHS,
  longStayMonths,
  registerDateLabel,
  shelterChipLabel,
} from "./labels";

const NOW = new Date("2026-08-15T00:00:00Z");

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

describe("animalMeta on the species tabs", () => {
  const rabbit = animal({ sex: "female", approximateAgeMonths: 24 });

  it("drops the species word only on a tab that names one species", () => {
    expect(animalMeta(rabbit, "sl", NOW, "all")).toBe(
      "Zajček · samica · 2 leti",
    );
    // The merged Ostale tab holds rabbits and whatever else, so the line
    // still has to say which animal this is.
    expect(animalMeta(rabbit, "sl", NOW, "other")).toBe(
      "Zajček · samica · 2 leti",
    );
    const cat = animal({ species: "cat", sex: "female", approximateAgeMonths: 24 });
    expect(animalMeta(cat, "sl", NOW, "cat")).toBe("samica · 2 leti");
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
