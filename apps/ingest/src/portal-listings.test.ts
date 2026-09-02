import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Animal, type ProviderPolicy } from "@posvoji/schema";
import {
  fetchPortalListings,
  PortalListingsPayload,
  type PortalListing,
} from "./portal-overrides";
import { buildListingAnimals, listingSourceUrl } from "./portal-listings";
import type { ShelterEntry } from "./shelters";

const contractPath = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "portal-listings.contract.json",
);

function contractExport(): unknown {
  const fixture = JSON.parse(readFileSync(contractPath, "utf8")) as {
    export: unknown;
  };
  return fixture.export;
}

function listing(fields: Partial<PortalListing> = {}): PortalListing {
  return {
    providerId: "johanca",
    id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
    species: "cat",
    status: "available",
    name: "Luna",
    photos: [],
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-09-01T11:30:00Z",
    ...fields,
  };
}

function payload(listings: PortalListing[]): PortalListingsPayload {
  return { generatedAt: "2026-09-01T12:00:00Z", listings };
}

function policy(fields: Partial<ProviderPolicy> = {}): ProviderPolicy {
  return {
    providerId: "johanca",
    source: "https://www.veterina-tolmin.si/",
    enabled: true,
    ingestion: "manual",
    images: "cache-permitted",
    descriptions: "full-permitted",
    logo: { use: "none" },
    permission: { status: "granted", date: "2026-09-01" },
    attribution: "Vir: Zavetišče JoHanca",
    crawl: { intervalHours: 12, excludePaths: [] },
    ...fields,
  } as ProviderPolicy;
}

function policies(...loaded: ProviderPolicy[]): Map<string, ProviderPolicy> {
  return new Map(loaded.map((p) => [p.providerId, p] as const));
}

const SHELTERS: Map<string, ShelterEntry> = new Map([
  [
    "johanca",
    {
      id: "johanca",
      name: "Zavetišče Johanca (Veterina Tolmin)",
      city: "Tolmin",
    },
  ],
]);

const NOW = "2026-09-01T12:05:00Z";

describe("PortalListingsPayload", () => {
  // The fixture is the contract between this schema and the portal's own
  // test. A change on one side that is not made on the other fails here.
  it("parses the contract fixture's export block", () => {
    const result = PortalListingsPayload.safeParse(contractExport());

    expect(result.success).toBe(true);
    expect(result.data?.listings).toHaveLength(4);
    expect(result.data?.listings[0]?.photos).toHaveLength(2);
    // A named shelter with no listing of its own is the case the field is
    // for, so the fixture carries one and this pins it.
    expect(result.data?.providers).toEqual([
      "contract-shelter",
      "contract-shelter-empty",
    ]);
  });

  // The fixture's envelope and this schema's keys are the same list, checked
  // from both sides: the portal asserts its response schema against
  // payloadFields, and this asserts the zod object against it too.
  it("declares exactly the payload fields the contract names", () => {
    const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
      payloadFields: string[];
    };

    expect(Object.keys(PortalListingsPayload.shape).sort()).toEqual(
      [...contract.payloadFields].sort(),
    );
  });

  // A portal older than the providers field says nothing rather than sending
  // an empty list, and a run against one has to keep working. export.ts reads
  // the absence as "the portal did not say" and behaves as it did before.
  it("parses a payload with no providers key", () => {
    const result = PortalListingsPayload.safeParse({
      generatedAt: "2026-09-01T12:00:00Z",
      listings: [listing()],
    });

    expect(result.success).toBe(true);
    expect(result.data?.providers).toBeUndefined();
  });

  it("rejects a providers entry that is not a non-empty string", () => {
    expect(
      PortalListingsPayload.safeParse({ ...payload([]), providers: [""] })
        .success,
    ).toBe(false);
    expect(
      PortalListingsPayload.safeParse({ ...payload([]), providers: [1] })
        .success,
    ).toBe(false);
  });

  it("rejects a null optional field", () => {
    const result = PortalListingsPayload.safeParse(
      payload([{ ...listing(), sex: null } as unknown as PortalListing]),
    );

    expect(result.success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const result = PortalListingsPayload.safeParse(
      payload([
        { ...listing(), microchip: "985112..." } as unknown as PortalListing,
      ]),
    );

    expect(result.success).toBe(false);
  });

  it('rejects status "unknown"', () => {
    const result = PortalListingsPayload.safeParse(
      payload([{ ...listing(), status: "unknown" } as unknown as PortalListing]),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a photo url that is not HTTP(S)", () => {
    const result = PortalListingsPayload.safeParse(
      payload([
        listing({
          photos: [
            {
              url: "javascript:alert(1)" as unknown as string,
              width: 10,
              height: 10,
            },
          ],
        }),
      ]),
    );

    expect(result.success).toBe(false);
  });
});

describe("buildListingAnimals", () => {
  it("builds the record the contract table describes", () => {
    const built = buildListingAnimals(
      payload([
        listing({
          sex: "female",
          breed: "mešanec",
          birthDate: "2026-01-15",
          approximateAgeMonths: 8,
          size: "small",
          energy: "lively",
          goodWithKids: "yes",
          goodWithDogs: "unknown",
          goodWithCats: "yes",
          apartmentOk: "yes",
          specialNeeds: false,
          shortDescription: "Radovedna in prijazna.",
          photos: [
            {
              url: "https://api.posvoji.si/media/listings/a/1.jpg",
              width: 1600,
              height: 1200,
            },
          ],
        }),
      ]),
      policies(policy()),
      SHELTERS,
      NOW,
    );

    expect(built.skipped).toEqual([]);
    expect(built.animals).toEqual([
      {
        id: "johanca:6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
        source: {
          providerId: "johanca",
          sourceAnimalId: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
          sourceUrl: "https://posvoji.si/zavetisca/johanca",
          fetchedAt: NOW,
          firstSeenAt: "2026-08-20T10:00:00Z",
          lastSeenAt: NOW,
        },
        shelter: {
          id: "johanca",
          name: "Zavetišče Johanca (Veterina Tolmin)",
          city: "Tolmin",
        },
        species: "cat",
        status: "available",
        images: [
          {
            sourceUrl: "https://api.posvoji.si/media/listings/a/1.jpg",
            rights: "cache-permitted",
          },
        ],
        attribution: "Vir: Zavetišče JoHanca",
        name: "Luna",
        sex: "female",
        breed: "mešanec",
        birthDate: "2026-01-15",
        approximateAgeMonths: 8,
        size: "small",
        energy: "lively",
        goodWith: { kids: "yes", dogs: "unknown", cats: "yes" },
        apartmentOk: "yes",
        specialNeeds: false,
        shortDescription: "Radovedna in prijazna.",
      },
    ]);
    expect(built.applied).toEqual([
      {
        providerId: "johanca",
        listingId: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
        animalId: "johanca:6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
        updatedAt: "2026-09-01T11:30:00Z",
      },
    ]);
  });

  // The dataset write parses every animal at the end of a run. Doing it here
  // means a listing that could not ship fails in this file rather than after
  // a crawl and an image sync.
  it("builds records the Animal schema accepts", () => {
    const built = buildListingAnimals(
      PortalListingsPayload.parse(contractExport()),
      policies(policy({ providerId: "contract-shelter" })),
      new Map([
        [
          "contract-shelter",
          { id: "contract-shelter", name: "Zavetišče", city: "Celje" },
        ],
      ]),
      NOW,
    );

    expect(built.animals).toHaveLength(4);
    for (const animal of built.animals) {
      expect(() => Animal.parse(animal)).not.toThrow();
    }
  });

  it("omits an optional field the listing does not carry", () => {
    const [animal] = buildListingAnimals(
      payload([listing()]),
      policies(policy()),
      SHELTERS,
      NOW,
    ).animals;

    expect(animal).toBeDefined();
    expect(Object.keys(animal!)).not.toContain("sex");
    expect(Object.keys(animal!)).not.toContain("goodWith");
    expect(Object.keys(animal!)).not.toContain("shortDescription");
  });

  it("keeps a partial goodWith and drops the keys that were not answered", () => {
    const [animal] = buildListingAnimals(
      payload([listing({ goodWithCats: "no" })]),
      policies(policy()),
      SHELTERS,
      NOW,
    ).animals;

    expect(animal?.goodWith).toEqual({ cats: "no" });
  });

  it("follows the images policy for the rights it stamps", () => {
    const photos = [
      { url: "https://api.posvoji.si/media/listings/a/1.jpg", width: 8, height: 8 },
    ];

    const remote = buildListingAnimals(
      payload([listing({ photos })]),
      policies(policy({ images: "remote" })),
      SHELTERS,
      NOW,
    );
    const none = buildListingAnimals(
      payload([listing({ photos })]),
      policies(policy({ images: "none" })),
      SHELTERS,
      NOW,
    );

    expect(remote.animals[0]?.images).toEqual([
      {
        sourceUrl: "https://api.posvoji.si/media/listings/a/1.jpg",
        rights: "display-permitted",
      },
    ]);
    // A provider with no photo grant ships no photo, rather than one the site
    // is not allowed to draw.
    expect(none.animals[0]?.images).toEqual([]);
  });

  // The portal's stored size describes the file the portal wrote. On Animal
  // those fields describe the cached copy, which cacheImages sets.
  it("does not copy the portal's pixel size onto the image", () => {
    const [animal] = buildListingAnimals(
      payload([
        listing({
          photos: [
            {
              url: "https://api.posvoji.si/media/listings/a/1.jpg",
              width: 1600,
              height: 1200,
            },
          ],
        }),
      ]),
      policies(policy()),
      SHELTERS,
      NOW,
    ).animals;

    expect(animal?.images[0]).not.toHaveProperty("width");
    expect(animal?.images[0]).not.toHaveProperty("cachedUrl");
  });

  it("skips and reports a listing whose provider has no policy", () => {
    const built = buildListingAnimals(
      payload([listing({ providerId: "kdo-ve" })]),
      policies(policy()),
      SHELTERS,
      NOW,
    );

    expect(built.animals).toEqual([]);
    expect(built.skipped).toEqual([
      {
        providerId: "kdo-ve",
        listingId: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
        reason: "unknown-provider",
      },
    ]);
  });

  it("skips and reports a listing from a disabled provider", () => {
    const built = buildListingAnimals(
      payload([listing()]),
      policies(policy({ enabled: false })),
      SHELTERS,
      NOW,
    );

    expect(built.animals).toEqual([]);
    expect(built.skipped[0]?.reason).toBe("provider-disabled");
  });

  // A crawled shelter creating a listing would duplicate the animal its own
  // site publishes on the next crawl.
  it("skips and reports a listing from a crawled provider", () => {
    const built = buildListingAnimals(
      payload([listing()]),
      policies(policy({ ingestion: "scrape" })),
      SHELTERS,
      NOW,
    );

    expect(built.animals).toEqual([]);
    expect(built.skipped[0]?.reason).toBe("provider-not-manual");
  });

  it("skips and reports a listing whose shelter is not in the register", () => {
    const built = buildListingAnimals(
      payload([listing()]),
      policies(policy()),
      new Map(),
      NOW,
    );

    expect(built.animals).toEqual([]);
    expect(built.skipped[0]?.reason).toBe("unknown-shelter");
  });

  // What --provider does to the listings feed: one manual shelter is built
  // and every other one is left to be carried forward, the same as a targeted
  // crawl leaves the shelters it does not visit.
  it("builds only the targeted provider when one is given", () => {
    const built = buildListingAnimals(
      payload([listing(), listing({ providerId: "oskar", id: "other" })]),
      policies(policy(), policy({ providerId: "oskar" })),
      new Map([
        ...SHELTERS,
        ["oskar", { id: "oskar", name: "Zavetišče Oskar", city: "Vitovlje" }],
      ]),
      NOW,
      new Set(["johanca"]),
    );

    expect(built.animals.map((a) => a.source.providerId)).toEqual(["johanca"]);
    expect(built.skipped).toEqual([
      { providerId: "oskar", listingId: "other", reason: "not-targeted" },
    ]);
  });

  it("links every listing to the shelter's own page on the site", () => {
    expect(listingSourceUrl("johanca")).toBe(
      "https://posvoji.si/zavetisca/johanca",
    );
  });
});

describe("fetchPortalListings", () => {
  const originalUrl = process.env["PORTAL_EXPORT_URL"];
  const originalToken = process.env["PORTAL_EXPORT_TOKEN"];
  const originalFixture = process.env["PORTAL_LISTINGS_FIXTURE"];

  beforeEach(() => {
    delete process.env["PORTAL_EXPORT_URL"];
    delete process.env["PORTAL_EXPORT_TOKEN"];
    delete process.env["PORTAL_LISTINGS_FIXTURE"];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch should not be called in this test");
      }),
    );
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env["PORTAL_EXPORT_URL"];
    else process.env["PORTAL_EXPORT_URL"] = originalUrl;
    if (originalToken === undefined) delete process.env["PORTAL_EXPORT_TOKEN"];
    else process.env["PORTAL_EXPORT_TOKEN"] = originalToken;
    if (originalFixture === undefined)
      delete process.env["PORTAL_LISTINGS_FIXTURE"];
    else process.env["PORTAL_LISTINGS_FIXTURE"] = originalFixture;
    vi.unstubAllGlobals();
  });

  it("returns null without making a network call when env vars are unset", async () => {
    await expect(fetchPortalListings()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a saved feed from disk instead of the network", async () => {
    process.env["PORTAL_LISTINGS_FIXTURE"] = join(
      import.meta.dirname,
      "..",
      "fixtures",
      "portal-listings.example.json",
    );

    const result = await fetchPortalListings();

    expect(fetch).not.toHaveBeenCalled();
    expect(result?.listings.map((l) => l.providerId)).toEqual([
      "johanca",
      "oskar",
    ]);
  });

  it("fetches the listings route with the export token", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si/base/";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";
    const body = payload([]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPortalListings()).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://portal.posvoji.si/base/api/export/listings",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  // The pipeline ships before the portal does. A deployment without the route
  // is an empty feed, not a broken run.
  it("treats a 404 as no listings feed rather than a failure", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );

    await expect(fetchPortalListings()).resolves.toBeNull();
  });

  it("throws on any other HTTP failure", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );

    await expect(fetchPortalListings()).rejects.toThrow(/HTTP 503/);
  });

  it("throws when the transport itself fails", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    await expect(fetchPortalListings()).rejects.toThrow(
      /portal listings request failed/,
    );
  });

  it("rejects non-HTTP portal URLs before making a request", async () => {
    process.env["PORTAL_EXPORT_URL"] = "file:///tmp/listings.json";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";

    await expect(fetchPortalListings()).rejects.toThrow(/HTTP\(S\) URL/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when the saved feed does not match the contract", async () => {
    const path = join(tmpdir(), "posvoji-bad-portal-listings.json");
    writeFileSync(path, JSON.stringify({ generatedAt: "2026-09-01T12:00:00Z" }));
    process.env["PORTAL_LISTINGS_FIXTURE"] = path;

    await expect(fetchPortalListings()).rejects.toThrow(/failed validation/);
  });
});
