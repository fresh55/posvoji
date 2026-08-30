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

  it.each(["javascript:alert(1)", "data:text/html,unsafe", "ftp://example.com"])(
    "rejects the non-HTTP(S) provider source URL %s",
    (source) => {
      expect(ProviderPolicy.safeParse({ ...basePolicy, source }).success).toBe(
        false,
      );
    },
  );

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

  it("defaults logo use to none when the policy omits it", () => {
    const result = ProviderPolicy.safeParse(basePolicy);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logo.use).toBe("none");
  });

  it("accepts a dated logo grant without catalogue permission", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: {
        use: "permitted",
        url: "https://www.macjahisa.si/logo.png",
        date: "2026-08-20",
        reference: "logo-mail-thread",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a permitted logo with granted permission", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: {
        use: "permitted",
        url: "https://www.macjahisa.si/logo.png",
        date: "2026-08-20",
      },
      permission: { status: "granted", date: "2026-08-20" },
    });
    expect(result.success).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:image/png;base64,AA==", "ftp://example.com"])(
    "rejects the non-HTTP(S) logo URL %s",
    (url) => {
      const result = ProviderPolicy.safeParse({
        ...basePolicy,
        logo: { use: "permitted", url, date: "2026-08-20" },
        permission: { status: "granted", date: "2026-08-20" },
      });
      expect(result.success).toBe(false);
    },
  );

  // A mark the shelter sent us rather than published: there is no URL to pin,
  // so the file travels with the repository and the policy names its path.
  it("accepts a permitted logo supplied as a file", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: {
        use: "permitted",
        file: "data/shelter-logos/potepuhi.jpg",
        date: "2026-08-30",
      },
      permission: { status: "granted", date: "2026-08-30" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a logo that is both fetched and supplied", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: {
        use: "permitted",
        url: "https://www.macjahisa.si/logo.png",
        file: "data/shelter-logos/macja-hisa.png",
        date: "2026-08-30",
      },
      permission: { status: "granted", date: "2026-08-30" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a supplied path that climbs out of the repository", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: {
        use: "permitted",
        file: "../../etc/passwd",
        date: "2026-08-30",
      },
      permission: { status: "granted", date: "2026-08-30" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a permitted logo without a date", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      logo: { use: "permitted" },
      permission: { status: "granted", date: "2026-08-20" },
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

  it.each([
    "privat-oddaja/",
    "//example.com/private",
    "/private?animal=1",
    "/private#animal",
    "/private\\animal",
    "/private/../animals",
    "/private/%2e%2e/animals",
    "/private//animals",
  ])("rejects the non-canonical crawl exclusion %s", (excluded) => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      crawl: { intervalHours: 12, excludePaths: [excluded] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a canonical absolute crawl exclusion", () => {
    const result = ProviderPolicy.safeParse({
      ...basePolicy,
      crawl: {
        intervalHours: 12,
        excludePaths: ["/posvoji-zival/oddajo-lastniki"],
      },
    });
    expect(result.success).toBe(true);
  });
});
