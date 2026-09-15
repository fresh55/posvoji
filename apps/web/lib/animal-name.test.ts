import { describe, expect, it } from "vitest";
import { displayName } from "@/lib/animal-name";
import { slugify } from "@/lib/animal-path";

describe("the name a surface prints", () => {
  it("takes a shouting name down to a capital and the rest lower case", () => {
    // Two shelters type their listings this way, which is 29 of the 486 names
    // in the register: Mala hiša and Meli Center Repče.
    expect(displayName("AKI")).toBe("Aki");
    expect(displayName("ROCKY")).toBe("Rocky");
    expect(displayName("TARZAN")).toBe("Tarzan");
  });

  it("lower-cases Slovenian letters as Slovenian", () => {
    expect(displayName("ČARLI")).toBe("Čarli");
    expect(displayName("ŠKRJANČEK")).toBe("Škrjanček");
    expect(displayName("ŽAN")).toBe("Žan");
  });

  it("gives every animal in a comma list its own capital", () => {
    // One listing, three kittens, one name field. The commas and the spacing
    // are the shelter's and are left where they are.
    expect(displayName("DISEL, LYANN, LUNA")).toBe("Disel, Lyann, Luna");
  });

  it("capitalises across a hyphen and an apostrophe", () => {
    expect(displayName("ANA-MARIJA")).toBe("Ana-Marija");
    expect(displayName("O'MALLEY")).toBe("O'Malley");
  });

  it("leaves a name that is not shouting exactly as the shelter wrote it", () => {
    // Anything with a lower-case letter in it is a spelling somebody chose,
    // and no rule here can improve on it.
    for (const name of [
      "Peter Zajec",
      "Tom in Lady",
      "Luna",
      "McFly",
      "iggy",
      "Rex II",
    ]) {
      expect(displayName(name)).toBe(name);
    }
  });

  it("reads the case off the letters and ignores everything else", () => {
    // A digit is neither upper nor lower, so it neither makes a name shout
    // nor saves one from it.
    expect(displayName("REX 2")).toBe("Rex 2");
    expect(displayName("Rex 2")).toBe("Rex 2");
    // Nothing with a case at all is nothing to decide.
    expect(displayName("2")).toBe("2");
    expect(displayName("?")).toBe("?");
    expect(displayName("")).toBe("");
  });

  it("does not move an animal's address", () => {
    // What a path is built from is the slug, which lower-cases and drops the
    // marks before it starts, so the two spellings are one address. ČARLI is
    // /zival/carli-... either way.
    for (const name of ["ČARLI", "DISEL, LYANN, LUNA", "ROCKY"]) {
      expect(slugify(displayName(name))).toBe(slugify(name));
    }
  });
});
