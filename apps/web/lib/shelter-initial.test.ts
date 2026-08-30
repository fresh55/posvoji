import { describe, expect, it } from "vitest";
import { shelterInitial } from "@/lib/shelter-initial";

describe("the monogram a shelter without a logo is drawn with", () => {
  it("gives the six logo-less shelters their own letters", () => {
    // The register as it stands. The first character of the full name printed
    // four Z and two V down one grid, which identified none of them. Five
    // letters for six shelters now, and the pair that shares one shares it on
    // its own name (Sia, Sevnica).
    const names = [
      "Veterinarska bolnica Brežice - zavetišče",
      "Zavetišče Sia in Lu",
      "Zavetišče Potepuhi",
      "Veterina Sevnica - zavetišče",
      "Zavetišče Johanca (Veterina Tolmin)",
      "Zavetišče Oskar Vitovlje",
    ];
    const initials = names.map(shelterInitial);

    expect(initials).toEqual(["B", "S", "P", "S", "J", "O"]);
    expect(new Set(initials).size).toBe(5);
  });

  it("reads through the bracket a name opens its distinctive word with", () => {
    expect(shelterInitial("Zavetišče (Johanca)")).toBe("J");
  });

  it("keeps a diacritic on the letter it prints", () => {
    // Folding is for matching the generic words, never for what is drawn.
    expect(shelterInitial("Zavetišče Črnomelj")).toBe("Č");
  });

  it("matches a generic word whichever way the source spells it", () => {
    expect(shelterInitial("Zavetisce Potepuhi")).toBe("P");
  });

  it("treats an English name the same way", () => {
    expect(shelterInitial("Animal shelter Koper")).toBe("K");
  });

  it("keeps an adjective that names a place rather than a kind of place", () => {
    expect(shelterInitial("Obalno zavetišče (Marjetica Koper)")).toBe("O");
  });

  it("falls back to the first letter when stripping leaves nothing", () => {
    expect(shelterInitial("Zavetišče")).toBe("Z");
    expect(shelterInitial("za zapuščene živali")).toBe("Z");
  });
});
