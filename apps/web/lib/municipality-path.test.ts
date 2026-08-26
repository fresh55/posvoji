import { describe, expect, it } from "vitest";
import { loadMunicipalities } from "./municipalities";
import {
  findMunicipalityBySlug,
  municipalityPath,
  municipalitySlug,
} from "./municipality-path";

// Every municipality gets a static page addressed by its slugified name. Two
// names folding to one slug would silently drop a page from the build and
// point the finder's address bar at somebody else's answer, so the registry
// has to stay free of collisions as it is edited.
describe("municipality paths", () => {
  const { municipalities } = loadMunicipalities();

  it("gives all 212 municipalities a slug of their own", () => {
    const slugs = new Set(municipalities.map((m) => municipalitySlug(m.name)));
    expect(slugs.size).toBe(municipalities.length);
  });

  it("keeps every slug usable as a single path segment", () => {
    for (const municipality of municipalities) {
      expect(municipalitySlug(municipality.name), municipality.name).toMatch(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      );
    }
  });

  it("folds Slovenian diacritics", () => {
    expect(municipalityPath("Šmartno pri Litiji")).toBe(
      "/najdena-zival/smartno-pri-litiji",
    );
    expect(municipalityPath("Črnomelj")).toBe("/najdena-zival/crnomelj");
  });

  it("finds the entry a path segment names", () => {
    const found = findMunicipalityBySlug(municipalities, "ljubljana");
    expect(found?.name).toBe("Ljubljana");
    expect(findMunicipalityBySlug(municipalities, "ni-obcine")).toBeUndefined();
  });
});
