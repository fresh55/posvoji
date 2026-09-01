import { describe, expect, it } from "vitest";
import { onMap } from "./geo";
import { POSTAL_DISTRICTS } from "./postal-districts";
import {
  hasPrefixMatch,
  lookupPostal,
  looksLikePostcode,
} from "./postal-lookup";

describe("lookupPostal", () => {
  it("matches a postcode", () => {
    const match = lookupPostal("1000");
    expect(match?.label).toBe("Ljubljana");
    expect(match?.at.lat).toBeCloseTo(46.05, 1);
    expect(match?.at.lon).toBeCloseTo(14.51, 1);
  });

  it("rejects an unknown postcode", () => {
    expect(lookupPostal("9999")).toBeUndefined();
  });

  it("matches a town by name", () => {
    const match = lookupPostal("Maribor");
    expect(match?.label).toBe("Maribor");
  });

  it("matches a town regardless of diacritics or case", () => {
    const match = lookupPostal("ajdovscina");
    expect(match?.label).toBe("Ajdovščina");
  });

  it("matches either half of a bilingual district name", () => {
    const match = lookupPostal("ancarano");
    expect(match?.label).toBe("Ankaran - Ancarano");
    expect(match?.at.lat).toBeCloseTo(45.58, 1);
  });

  it("returns undefined for garbage input", () => {
    expect(lookupPostal("asdfghjkl")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const match = lookupPostal("  Koper  ");
    expect(match?.label).toBe("Koper - Capodistria");
  });

  it("returns undefined for an empty or blank string", () => {
    expect(lookupPostal("")).toBeUndefined();
    expect(lookupPostal("   ")).toBeUndefined();
  });
});

describe("lookupPostal name collisions", () => {
  it("gives a whole name to the district that carries it whole", () => {
    // Five districts spell "Ljubljana - X". Only one is Ljubljana.
    expect(lookupPostal("ljubljana")?.label).toBe("Ljubljana");
    expect(lookupPostal("ljubljana")?.at.lat).toBeCloseTo(46.05, 2);
  });

  it("prefers 6274 Šmarje over the Šmarje half of Šmarje - Sap", () => {
    const match = lookupPostal("smarje");
    expect(match?.label).toBe("Šmarje");
    expect(match?.at.lat).toBeCloseTo(45.49, 2);
  });

  it("refuses to pick between two districts of the same full name", () => {
    // 3271 and 8232 are both simply Šentrupert. Choosing one would be a guess.
    expect(lookupPostal("sentrupert")).toBeUndefined();
  });

  it("still resolves a name that is unique in full", () => {
    expect(lookupPostal("kranj")?.label).toBe("Kranj");
    expect(lookupPostal("kranjska gora")?.label).toBe("Kranjska Gora");
  });
});

// Every "X - Y" district name used to be split into two keys. That is right
// for a bilingual name and wrong for a Slovene one, where half a name is not a
// name for the place.
describe("lookupPostal compound district names", () => {
  it("does not answer Videm with 1312 Videm - Dobrepolje", () => {
    // 1312 is Videm in Občina Dobrepolje. Občina Videm is 80 km east, at
    // Videm pri Ptuju, and this used to hand a found animal in one of them to
    // the other one's shelter.
    expect(lookupPostal("videm")?.code).not.toBe("1312");
    // Two districts start with it and neither is named it, so the honest
    // answer is none: the picker falls back to matching občina names.
    expect(lookupPostal("videm")).toBeUndefined();
  });

  it("does not answer half of any other Slovene compound name", () => {
    // 1210 Ljubljana - Šentvid over 1296 Šentvid pri Stični, and 1260
    // Ljubljana - Polje over nothing at all.
    expect(lookupPostal("sentvid")?.code).not.toBe("1210");
    expect(lookupPostal("polje")).toBeUndefined();
  });

  it("still resolves a compound name typed in full", () => {
    expect(lookupPostal("Videm - Dobrepolje")?.code).toBe("1312");
    expect(lookupPostal("smarje - sap")?.code).toBe("1293");
  });

  it("still splits the genuinely bilingual names", () => {
    // Italian on the coast, Hungarian in Prekmurje.
    expect(lookupPostal("ancarano")?.label).toBe("Ankaran - Ancarano");
    expect(lookupPostal("pirano")?.label).toBe("Piran - Pirano");
    expect(lookupPostal("isola")?.label).toBe("Izola - Isola");
    expect(lookupPostal("lendva")?.label).toBe("Lendava - Lendva");
    expect(lookupPostal("dobronak")?.label).toBe("Dobrovnik - Dobronak");
  });
});

describe("lookupPostal pasted formats", () => {
  it("reads a postcode pasted in front of its town", () => {
    expect(lookupPostal("1000 Ljubljana")?.label).toBe("Ljubljana");
  });

  it("reads a postcode pasted after its town", () => {
    expect(lookupPostal("Ljubljana 1000")?.label).toBe("Ljubljana");
  });

  it("reads a postcode carrying the country prefix", () => {
    expect(lookupPostal("SI-1000")?.label).toBe("Ljubljana");
    expect(lookupPostal("si1000")?.label).toBe("Ljubljana");
    expect(lookupPostal("SI 1000")?.label).toBe("Ljubljana");
  });

  it("takes the first run when a paste carries more than one", () => {
    expect(lookupPostal("1000 Ljubljana 2000")?.label).toBe("Ljubljana");
  });

  it("does not treat a longer run of digits as a postcode", () => {
    expect(lookupPostal("10000")).toBeUndefined();
  });

  it("returns nothing for a four-digit run no district answers to", () => {
    expect(lookupPostal("9998 Nekje")).toBeUndefined();
  });
});

describe("looksLikePostcode", () => {
  it("recognises every shape a postcode is pasted in", () => {
    expect(looksLikePostcode("1000")).toBe(true);
    expect(looksLikePostcode("9998")).toBe(true);
    expect(looksLikePostcode("1000 Ljubljana")).toBe(true);
    expect(looksLikePostcode("Ljubljana 1000")).toBe(true);
    expect(looksLikePostcode("SI-1000")).toBe(true);
  });

  it("does not see one in a name or in a wrong-length number", () => {
    expect(looksLikePostcode("Ljubljana")).toBe(false);
    expect(looksLikePostcode("100")).toBe(false);
    expect(looksLikePostcode("10000")).toBe(false);
  });
});

describe("hasPrefixMatch", () => {
  it("is true while a district name can still grow out of the input", () => {
    expect(hasPrefixMatch("lju")).toBe(true);
    expect(hasPrefixMatch("smar")).toBe(true);
    expect(hasPrefixMatch("kranjsk")).toBe(true);
  });

  it("is false for an input no name continues", () => {
    expect(hasPrefixMatch("qqqqq")).toBe(false);
    expect(hasPrefixMatch("")).toBe(false);
    // A name that is complete is not a name in progress.
    expect(hasPrefixMatch("sentrupert")).toBe(false);
  });
});

describe("postal districts against the map", () => {
  // The origin marker is drawn by projecting the matched district, and the
  // "your location is outside the map" line assumes a typed origin never is.
  // A regenerated table that reached past the frame would break both quietly.
  it("places every district inside the map's frame", () => {
    const off = POSTAL_DISTRICTS.filter(
      (district) => !onMap({ lat: district.lat, lon: district.lon }),
    );

    expect(off.map((district) => `${district.code} ${district.name}`)).toEqual(
      [],
    );
  });
});
