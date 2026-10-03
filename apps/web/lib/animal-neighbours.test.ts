import { describe, expect, it } from "vitest";
import { shelterNeighbours } from "@/lib/animal-neighbours";

type Row = Parameters<typeof shelterNeighbours>[1];

function row(
  id: string,
  shelter = "horjul",
  species: Row["species"] = "cat",
  status: Row["status"] = "available",
): Row {
  return { id, species, status, shelter: { id: shelter } };
}

const ids = (rows: Row[]) => rows.map((entry) => entry.id);

describe("shelterNeighbours", () => {
  it("offers the same shelter's animals and never the animal itself", () => {
    const animals = [row("a"), row("b", "meli"), row("c"), row("d")];
    expect(ids(shelterNeighbours(animals, animals[0]!))).toEqual(["c", "d"]);
  });

  it("reads on from the animal's own place and wraps round", () => {
    const animals = ["a", "b", "c", "d", "e", "f"].map((id) => row(id));
    expect(ids(shelterNeighbours(animals, animals[3]!))).toEqual([
      "e",
      "f",
      "a",
      "b",
    ]);
  });

  it("puts the animal's own species first", () => {
    const animals = [row("a"), row("dog", "horjul", "dog"), row("b"), row("c")];
    expect(ids(shelterNeighbours(animals, animals[0]!))).toEqual([
      "b",
      "c",
      "dog",
    ]);
  });

  it("leaves out animals nobody can adopt now", () => {
    const animals = [
      row("a"),
      row("gone", "horjul", "cat", "adopted"),
      row("held", "horjul", "cat", "hold"),
      row("b"),
    ];
    expect(ids(shelterNeighbours(animals, animals[0]!))).toEqual(["b"]);
  });

  it("is empty for a shelter's only animal", () => {
    const animals = [row("a"), row("b", "meli")];
    expect(shelterNeighbours(animals, animals[0]!)).toEqual([]);
  });
});
