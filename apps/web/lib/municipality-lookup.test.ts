import { describe, expect, it } from "vitest";
import { loadMunicipalities } from "./municipalities";
import {
  municipalitiesForInput,
  municipalitiesNear,
} from "./municipality-lookup";
import { POSTCODE_MUNICIPALITIES } from "./postcode-municipalities";

describe("postcode to municipality", () => {
  const known = new Set(loadMunicipalities().municipalities.map((m) => m.name));

  it("names only municipalities the coverage registry knows", () => {
    for (const entry of POSTCODE_MUNICIPALITIES) {
      for (const municipality of entry.municipalities) {
        expect(known, `${entry.code}: ${municipality}`).toContain(municipality);
      }
    }
  });

  it("can reach every one of the 212 municipalities", () => {
    const reachable = new Set(
      POSTCODE_MUNICIPALITIES.flatMap((entry) => entry.municipalities),
    );
    expect(reachable.size).toBe(known.size);
  });

  it("resolves a postcode to its municipality", () => {
    expect(municipalitiesForInput("1000")?.municipalities[0]).toBe("Ljubljana");
    expect(municipalitiesForInput("2000")?.municipalities[0]).toBe("Maribor");
    expect(municipalitiesForInput("6000")?.municipalities[0]).toBe("Koper");
  });

  it("reads a postcode out of a pasted address", () => {
    expect(municipalitiesForInput("SI-4000 Kranj")?.municipalities[0]).toBe(
      "Kranj",
    );
  });

  it("resolves a town name typed in full", () => {
    expect(municipalitiesForInput("Šenčur")?.municipalities[0]).toBe("Šenčur");
  });

  it("returns nothing for input it cannot place", () => {
    expect(municipalitiesForInput("9999")).toBeUndefined();
    expect(municipalitiesForInput("")).toBeUndefined();
  });

  it("lists several municipalities for a district that straddles a border", () => {
    const split = POSTCODE_MUNICIPALITIES.find(
      (entry) => entry.municipalities.length > 1,
    );
    expect(split).toBeDefined();
    expect(municipalitiesForInput(split!.code)?.municipalities.length).toBe(
      split!.municipalities.length,
    );
  });

  it("resolves coordinates through the nearest postal district", () => {
    // Ljubljana city centre.
    const guess = municipalitiesNear({ lat: 46.0569, lon: 14.5058 });
    expect(guess?.municipalities).toContain("Ljubljana");
  });
});
