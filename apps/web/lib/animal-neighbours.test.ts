import { describe, expect, it } from "vitest";
import { shelterNeighbours } from "@/lib/animal-neighbours";

type Row = Parameters<typeof shelterNeighbours>[1];

function row(
  id: string,
  species: Row["species"] = "cat",
  status: Row["status"] = "available",
): Row {
  return { id, species, status };
}

const ids = (rows: Row[]) => rows.map((entry) => entry.id);

describe("shelterNeighbours", () => {
  it("never offers the animal itself", () => {
    const shelter = [row("a"), row("b"), row("c")];
    expect(ids(shelterNeighbours(shelter, shelter[0]!))).toEqual(["b", "c"]);
  });

  it("reads on from the animal's own place and wraps round", () => {
    const shelter = ["a", "b", "c", "d", "e", "f"].map((id) => row(id));
    expect(ids(shelterNeighbours(shelter, shelter[3]!))).toEqual([
      "e",
      "f",
      "a",
      "b",
    ]);
  });

  it("puts the animal's own species first", () => {
    const shelter = [row("a"), row("dog", "dog"), row("b"), row("c")];
    expect(ids(shelterNeighbours(shelter, shelter[0]!))).toEqual([
      "b",
      "c",
      "dog",
    ]);
  });

  it("leaves out animals nobody can adopt now", () => {
    const shelter = [
      row("a"),
      row("gone", "cat", "adopted"),
      row("held", "cat", "hold"),
      row("b"),
    ];
    expect(ids(shelterNeighbours(shelter, shelter[0]!))).toEqual(["b"]);
  });

  it("is empty for a shelter's only animal", () => {
    const shelter = [row("a")];
    expect(shelterNeighbours(shelter, shelter[0]!)).toEqual([]);
  });
});
