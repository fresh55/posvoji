import { describe, expect, it } from "vitest";
import { ProviderPolicy } from "./policy";

const basePolicy = {
  providerId: "macja-hisa",
  source: "https://www.macjahisa.si/muce_za_posvojitev.php",
  enabled: false,
  ingestion: "scrape",
  images: "none",
  descriptions: "facts-only",
  permission: { status: "none" },
  attribution: "Vir: Zavetišče Mačja hiša",
  crawl: { intervalHours: 12 },
};

describe("ProviderPolicy", () => {
  it("accepts a disabled provider without permission", () => {
    expect(ProviderPolicy.safeParse(basePolicy).success).toBe(true);
  });

  it("rejects an enabled provider without granted permission", () => {
    const result = ProviderPolicy.safeParse({ ...basePolicy, enabled: true });
    expect(result.success).toBe(false);
  });

  it("accepts an enabled provider with dated granted permission", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      enabled: true,
      images: "cache-permitted",
      permission: { status: "granted", date: "2026-09-01" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects granted permission without a date", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      permission: { status: "granted" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects images beyond 'none' without granted permission", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      images: "remote",
    });
    expect(result.success).toBe(false);
  });

  it("rejects descriptions beyond facts without granted permission", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      descriptions: "full-permitted",
    });
    expect(result.success).toBe(false);
  });
});
