import { describe, expect, it } from "vitest";
import { Species } from "@posvoji/schema";
import { SPECIES_ORDER, SPECIES_SLUGS } from "@/lib/species";

// SPECIES_ORDER is read off SPECIES_SLUGS' keys rather than off the schema's
// zod enum, because naming that enum in app code pulls the whole zod runtime
// into the browser. Record<Species, string> keeps a species from going missing,
// but nothing in the types keeps the two in the same ORDER, and that order is
// what the tabs, the result count and the shelter pick card are drawn in.
//
// This is the one place allowed to import the enum as a value: a test is never
// bundled. See the no-restricted-imports block in eslint.config.mjs.
describe("SPECIES_ORDER", () => {
  it("matches the schema enum, in the schema's order", () => {
    expect(SPECIES_ORDER).toEqual(Species.options);
  });

  it("has a slug for every species and no extras", () => {
    expect(Object.keys(SPECIES_SLUGS).sort()).toEqual([...Species.options].sort());
  });

  it("keeps the slugs unique, so a URL decodes to one species", () => {
    const slugs = Object.values(SPECIES_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
