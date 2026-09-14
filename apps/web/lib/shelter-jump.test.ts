import { describe, expect, it } from "vitest";
import { animalCount } from "@/lib/labels";
import { jumpChips } from "./shelter-jump";

const label = (count: number) => animalCount(count, "sl");

describe("the phone strip's chips", () => {
  it("draws one chip per town, landing on the town's first card", () => {
    // The real register: Celje holds Mačja hiša and Sia in Lu, side by side
    // in the grid. Two chips both reading "Celje" said nothing about which
    // was which; one chip lands on the first and the other is the next card.
    const chips = jumpChips(
      [
        { id: "brezice", city: "Brežice" },
        { id: "macja-hisa", city: "Celje", animals: 186 },
        { id: "sia-in-lu", city: "Celje" },
        { id: "zonzani", city: "Dramlje", animals: 18 },
      ],
      label,
    );

    expect(chips.map((chip) => chip.id)).toEqual([
      "brezice",
      "macja-hisa",
      "zonzani",
    ]);
    expect(chips.map((chip) => chip.city)).toEqual([
      "Brežice",
      "Celje",
      "Dramlje",
    ]);
  });

  it("adds a town's shelters up, on the card's own never-print-a-zero rule", () => {
    const chips = jumpChips(
      [
        { id: "a", city: "Celje", animals: 2 },
        { id: "b", city: "Celje", animals: 1 },
        { id: "c", city: "Koper", animals: 0 },
        { id: "d", city: "Maribor" },
      ],
      label,
    );

    // Three, not "2" and "1": the chip is the town's.
    expect(chips[0].count).toEqual({ value: 3, label: "3 živali" });
    // A zero and an absence are the same answer, and neither sends the key.
    expect("count" in chips[1]).toBe(false);
    expect("count" in chips[2]).toBe(false);
  });

  it("keeps the grid's order whatever the towns are called", () => {
    const chips = jumpChips(
      [
        { id: "z", city: "Zreče" },
        { id: "a", city: "Ajdovščina" },
        { id: "z2", city: "Zreče" },
      ],
      label,
    );

    expect(chips.map((chip) => chip.city)).toEqual(["Zreče", "Ajdovščina"]);
  });
});
