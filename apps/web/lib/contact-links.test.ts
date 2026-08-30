import { describe, expect, it } from "vitest";
import { mailtoHref, telHref } from "./contact-links";
import { loadShelters } from "./shelters";

describe("telHref", () => {
  // The failure these cover is silent: a national tel: URL looks right in the
  // markup and dials fine on a Slovenian handset, and only the visitor
  // roaming on a foreign SIM finds out it reaches nobody.
  it("dials a landline with the country code in place of the trunk 0", () => {
    expect(telHref("07 496 11 56")).toBe("tel:+38674961156");
    expect(telHref("03 749 06 00")).toBe("tel:+38637490600");
  });

  it("dials a mobile the same way, though the register groups it differently", () => {
    expect(telHref("031 326 877")).toBe("tel:+38631326877");
    expect(telHref("040 218 861")).toBe("tel:+38640218861");
  });

  it("leaves a number already in international form alone", () => {
    expect(telHref("+386 7 496 11 56")).toBe("tel:+38674961156");
    expect(telHref("00386 7 496 11 56")).toBe("tel:+38674961156");
  });

  it("is idempotent, so a converted number survives being converted again", () => {
    const once = telHref("07 496 11 56").replace("tel:", "");

    expect(telHref(once)).toBe("tel:+38674961156");
  });

  it("reads a number however the register spaced or bracketed it", () => {
    expect(telHref("07496 1156")).toBe("tel:+38674961156");
    expect(telHref("  07 496 11 56  ")).toBe("tel:+38674961156");
    expect(telHref("(07) 496-11-56")).toBe("tel:+38674961156");
  });

  // The conservative half of the contract. Guessing a country code onto a
  // shape nobody planned for produces a number that dials nobody at all,
  // which is worse than the national number that at least dials at home.
  it("hands back a shape it does not recognise rather than guessing", () => {
    expect(telHref("080 12 34")).toBe("tel:0801234");
    expect(telHref("07 496 11 56 / 57")).toBe("tel:074961156/57");
    expect(telHref("112")).toBe("tel:112");
  });
});

describe("mailtoHref", () => {
  it("passes the address through, having nothing local to expand", () => {
    expect(mailtoHref("info@example.test")).toBe("mailto:info@example.test");
  });
});

// The same rule against the register the site is actually built from, so an
// entry transcribed in a shape the conversion does not know falls out here
// rather than as a phone that will not dial abroad.
describe("the register the site is built from", () => {
  it("gives every number it lists an E.164 href", () => {
    const numbers = loadShelters()
      .map((shelter) => shelter.phone)
      .filter((phone): phone is string => typeof phone === "string");

    expect(numbers.length).toBeGreaterThan(0);
    for (const phone of numbers) {
      expect(telHref(phone)).toMatch(/^tel:\+386\d{8}$/);
    }
  });
});
