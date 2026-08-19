import { describe, expect, it } from "vitest";
import { getShelterBySlug, loadShelters } from "./shelters";

describe("shelter registry loader", () => {
  it("loads every shelter from data/shelters.yaml", () => {
    const shelters = loadShelters();
    expect(shelters.length).toBeGreaterThan(10);
    expect(
      shelters.every((shelter) => shelter.id && shelter.name && shelter.city),
    ).toBe(true);
  });

  it("keeps shelter ids unique", () => {
    const ids = loadShelters().map((shelter) => shelter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("parses a known entry with every optional field present", () => {
    const zonzani = getShelterBySlug("zonzani");
    expect(zonzani).toMatchObject({
      id: "zonzani",
      name: "Zavetišče Zonzani",
      city: "Dramlje",
      website: "https://www.zonzani.si/",
      email: "info@zonzani.si",
      phone: "03 749 06 00",
    });
  });

  it("leaves missing optional fields undefined rather than guessing", () => {
    const johanca = getShelterBySlug("johanca");
    expect(johanca?.city).toBe("Tolmin");
    expect(johanca?.website).toBeUndefined();
    expect(johanca?.phone).toBeUndefined();
  });

  it("returns undefined for a slug that isn't in the registry", () => {
    expect(getShelterBySlug("does-not-exist")).toBeUndefined();
  });
});
