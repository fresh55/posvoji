import { describe, expect, it } from "vitest";
import { shelterChipLabel } from "./labels";

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
