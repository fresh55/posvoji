import { describe, expect, it } from "vitest";
import { shelterChipLabel } from "./labels";

describe("shelterChipLabel", () => {
  it("drops the noun every shelter shares when it opens the name", () => {
    // Five of the registry's shelters open with this word. On a 390px phone
    // the pill was 180px, half the row, and truncation cuts from the right:
    // it kept "Zavetišče Mala…" and threw away the half that says which one.
    expect(shelterChipLabel("Zavetišče Mala hiša")).toBe("Mala hiša");
    expect(shelterChipLabel("Zavetišče Maribor (Snaga)")).toBe(
      "Maribor (Snaga)",
    );
    expect(shelterChipLabel("Zavetišče Johanca (Veterina Tolmin)")).toBe(
      "Johanca (Veterina Tolmin)",
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

  it("leaves a name carrying the noun in the middle of it alone", () => {
    // The adjective in front is what distinguishes this one, so the noun is
    // load-bearing where it sits.
    expect(shelterChipLabel("Obalno zavetišče (Marjetica Koper)")).toBe(
      "Obalno zavetišče (Marjetica Koper)",
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
});
