import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  normalizeAnimalOrigin,
  normalizeOriginMunicipality,
} from "./normalize-origin";

function animal(overrides: Partial<Animal> & { id: string }): Animal {
  return {
    source: {
      providerId: "muri",
      sourceUrl: `https://example.si/${overrides.id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: "muri", name: "Zavod Muri", city: "Vransko" },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavod Muri",
    ...overrides,
  };
}

describe("normalizeOriginMunicipality", () => {
  it("keeps real municipality names", () => {
    expect(normalizeOriginMunicipality("Vransko")).toBe("Vransko");
    expect(normalizeOriginMunicipality("Rečica ob Savinji")).toBe(
      "Rečica ob Savinji",
    );
    expect(normalizeOriginMunicipality("Hrpelje – Kozina")).toBe(
      "Hrpelje – Kozina",
    );
  });

  it("drops the owner-surrender phrasings seen in the wild", () => {
    expect(
      normalizeOriginMunicipality("Oddana s strani lastnika"),
    ).toBeUndefined();
    expect(
      normalizeOriginMunicipality("Oddan s strani lastnika"),
    ).toBeUndefined();
    expect(
      normalizeOriginMunicipality("oddana s strani skrbnikov"),
    ).toBeUndefined();
    expect(normalizeOriginMunicipality("oddan")).toBeUndefined();
  });

  it("drops empty and whitespace-only values and trims the rest", () => {
    expect(normalizeOriginMunicipality("")).toBeUndefined();
    expect(normalizeOriginMunicipality("   ")).toBeUndefined();
    expect(normalizeOriginMunicipality(" Kamnik ")).toBe("Kamnik");
  });

  it("passes undefined through", () => {
    expect(normalizeOriginMunicipality(undefined)).toBeUndefined();
  });
});

describe("normalizeAnimalOrigin", () => {
  it("returns the same object when the value is already a place", () => {
    const luna = animal({ id: "muri:luna", originMunicipality: "Vransko" });
    expect(normalizeAnimalOrigin(luna)).toBe(luna);
  });

  it("returns the same object when the field is absent", () => {
    const luna = animal({ id: "muri:luna" });
    expect(normalizeAnimalOrigin(luna)).toBe(luna);
  });

  it("removes the key entirely for an owner-surrender phrase", () => {
    const luna = animal({
      id: "muri:luna",
      originMunicipality: "Oddana s strani lastnika",
    });
    const cleaned = normalizeAnimalOrigin(luna);
    expect(cleaned).not.toBe(luna);
    expect("originMunicipality" in cleaned).toBe(false);
    expect(cleaned.name).toBe(luna.name);
    expect(cleaned.source).toEqual(luna.source);
  });

  it("keeps a trimmed place value", () => {
    const luna = animal({ id: "muri:luna", originMunicipality: " Kamnik " });
    expect(normalizeAnimalOrigin(luna).originMunicipality).toBe("Kamnik");
  });
});
