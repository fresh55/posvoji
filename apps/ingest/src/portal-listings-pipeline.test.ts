import { describe, expect, it } from "vitest";
import type { Animal, ProviderPolicy } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { captureCrawledSnapshot } from "./crawled-snapshot";
import { exitCodeForRun } from "./exit-codes";
import {
  crawlablePolicies,
  isManualPolicy,
  manualPolicies,
  type LoadedPolicy,
} from "./policies";
import { buildListingAnimals } from "./portal-listings";
import type { PortalListingsPayload } from "./portal-listings-contract";
import {
  carryFirstSeenAt,
  guardMassRemoval,
  guardUniqueAnimalIds,
  retainableAnimals,
} from "./run-guards";
import type { ShelterEntry } from "./shelters";

// export.ts is a script with a top-level await and a disk full of side
// effects, so there is no harness that runs it. What can be checked is the
// sequence it puts an animal through, in the order it puts it through, with a
// manual shelter's listings joining the crawled records at the point export.ts
// joins them: before carryFirstSeenAt and before every guard. Each helper has
// its own tests; these are about the order and about what the listings do to
// it.

const NOW = "2026-09-01T12:05:00Z";

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

function loaded(p: ProviderPolicy): LoadedPolicy {
  return { dir: `providers/${p.providerId}`, policy: p };
}

const SHELTERS: ReadonlyMap<string, ShelterEntry> = new Map([
  ["johanca", { id: "johanca", name: "Zavetišče JoHanca", city: "Tolmin" }],
  ["muri", { id: "muri", name: "Zavod Muri", city: "Vransko" }],
]);

function feed(ids: string[], providerId = "johanca"): PortalListingsPayload {
  return {
    generatedAt: "2026-09-01T12:00:00Z",
    listings: ids.map((id) => ({
      providerId,
      id,
      species: "cat" as const,
      status: "available" as const,
      name: id,
      photos: [],
      createdAt: "2026-08-20T10:00:00Z",
      updatedAt: "2026-09-01T11:30:00Z",
    })),
  };
}

function crawledAnimal(id: string, providerId = "muri"): Animal {
  return {
    id: `${providerId}:${id}`,
    source: {
      providerId,
      sourceAnimalId: id,
      sourceUrl: `https://zavodmuri.si/${id}`,
      fetchedAt: NOW,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    },
    shelter: { id: providerId, name: "Zavod Muri", city: "Vransko" },
    species: "dog",
    status: "available",
    images: [],
    attribution: "Vir: Zavod Muri",
  };
}

// The run, from the crawl's output to the crawled snapshot, in export.ts's
// order. crawledProviderIds is what the two ends of the manual case turn on:
// a provider is in it when this run has a fresh answer for it.
function runPipeline(input: {
  crawled: Animal[];
  listings: Animal[];
  previousCrawled: Animal[];
  crawledProviderIds: Set<string>;
  policies: Map<string, ProviderPolicy>;
}): { published: Animal[]; snapshot: Animal[] } {
  const produced = [...input.crawled, ...input.listings];
  const refreshed = carryFirstSeenAt(input.previousCrawled, produced, {
    sharedSourceUrlProviderIds: new Set(
      [...input.policies.values()]
        .filter((p) => isManualPolicy(p))
        .map((p) => p.providerId),
    ),
  });
  const carried = input.previousCrawled.filter(
    (a) => !input.crawledProviderIds.has(a.source.providerId),
  );
  const { animals: preserved } = retainableAnimals(carried, input.policies);
  const seeded = [...preserved, ...refreshed];
  guardUniqueAnimalIds(seeded);
  const restricted = applyAllowedFields(seeded, input.policies);
  const snapshot = captureCrawledSnapshot(restricted.animals);
  guardMassRemoval(input.previousCrawled, restricted.animals, {
    crawledProviderIds: input.crawledProviderIds,
  });
  return { published: restricted.animals, snapshot };
}

describe("the crawl loop and the listings feed", () => {
  it("leaves a manual provider out of the crawl and in the manual set", () => {
    const all = [
      loaded(policy()),
      loaded(policy({ providerId: "muri", ingestion: "scrape" })),
      loaded(policy({ providerId: "oskar" })),
      loaded(policy({ providerId: "off", enabled: false })),
    ];

    expect(crawlablePolicies(all).map(({ policy: p }) => p.providerId)).toEqual([
      "muri",
    ]);
    expect(manualPolicies(all).map(({ policy: p }) => p.providerId)).toEqual([
      "johanca",
      "oskar",
    ]);
  });

  it("puts the listings in the crawled snapshot alongside the crawl", () => {
    const listings = buildListingAnimals(
      feed(["luna", "pika"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      NOW,
    ).animals;

    const { snapshot } = runPipeline({
      crawled: [crawledAnimal("rex")],
      listings,
      previousCrawled: [],
      crawledProviderIds: new Set(["muri", "johanca"]),
      policies: new Map([
        ["johanca", policy()],
        ["muri", policy({ providerId: "muri", ingestion: "scrape" })],
      ]),
    });

    // animals.crawled.json is what the crawl said, and for a manual shelter
    // the portal is the crawl.
    expect(snapshot.map((a) => a.id).sort()).toEqual([
      "johanca:luna",
      "johanca:pika",
      "muri:rex",
    ]);
  });

  it("carries a listing's firstSeenAt and starts a new one at its createdAt", () => {
    const previous = buildListingAnimals(
      feed(["luna"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      "2026-07-01T00:00:00Z",
    ).animals.map((a) => ({
      ...a,
      source: { ...a.source, firstSeenAt: "2026-05-01T00:00:00Z" },
    }));

    const listings = buildListingAnimals(
      feed(["luna", "nova"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      NOW,
    ).animals;

    const { published } = runPipeline({
      crawled: [],
      listings,
      previousCrawled: previous,
      crawledProviderIds: new Set(["johanca"]),
      policies: new Map([["johanca", policy()]]),
    });

    const byId = new Map(published.map((a) => [a.id, a] as const));
    expect(byId.get("johanca:luna")?.source.firstSeenAt).toBe(
      "2026-05-01T00:00:00Z",
    );
    // Every manual listing links to the same shelter page, so the sourceUrl
    // fallback in carryFirstSeenAt must not hand a new listing the date of an
    // old one. Its own createdAt is what it keeps.
    expect(byId.get("johanca:nova")?.source.firstSeenAt).toBe(
      "2026-08-20T10:00:00Z",
    );
  });

  it("still fails on an id a listing and a crawled animal both claim", () => {
    const listings = buildListingAnimals(
      feed(["luna"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      NOW,
    ).animals;
    const collision: Animal = { ...crawledAnimal("x"), id: "johanca:luna" };

    expect(() =>
      runPipeline({
        crawled: [collision],
        listings,
        previousCrawled: [],
        crawledProviderIds: new Set(["muri", "johanca"]),
        policies: new Map([
          ["johanca", policy()],
          ["muri", policy({ providerId: "muri", ingestion: "scrape" })],
        ]),
      }),
    ).toThrow(/duplicate animal id/);
  });

  // Archiving is a manual shelter's delete, so a feed that suddenly names one
  // of ten animals is the same event as a parser that stopped matching.
  it("counts the listings for the removal guard", () => {
    const ten = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const previous = buildListingAnimals(
      feed(ten),
      new Map([["johanca", policy()]]),
      SHELTERS,
      "2026-08-01T00:00:00Z",
    ).animals;
    const listings = buildListingAnimals(
      feed(["a"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      NOW,
    ).animals;

    expect(() =>
      runPipeline({
        crawled: [],
        listings,
        previousCrawled: previous,
        crawledProviderIds: new Set(["johanca"]),
        policies: new Map([["johanca", policy()]]),
      }),
    ).toThrow(/removal guard: johanca 10 -> 1/);
  });

  // The outage case. The feed did not answer, so the provider is not in
  // crawledProviderIds: its animals come back from the previous snapshot,
  // the guard has nothing to check, and the run is degraded rather than clean.
  it("carries a manual provider forward when the feed fails, and exits 2", () => {
    const previous = buildListingAnimals(
      feed(["a", "b", "c", "d", "e"]), // five, and every one of them comes back
      new Map([["johanca", policy()]]),
      SHELTERS,
      "2026-08-01T00:00:00Z",
    ).animals;

    const { published } = runPipeline({
      crawled: [crawledAnimal("rex")],
      listings: [],
      previousCrawled: previous,
      crawledProviderIds: new Set(["muri"]),
      policies: new Map([
        ["johanca", policy()],
        ["muri", policy({ providerId: "muri", ingestion: "scrape" })],
      ]),
    });

    expect(
      published.filter((a) => a.source.providerId === "johanca"),
    ).toHaveLength(5);
    // export.ts pushes every enabled manual provider onto the same failed list
    // a thrown crawl uses, and that list is all exitCodeForRun reads.
    expect(exitCodeForRun(["johanca"].length)).toBe(2);
  });

  // The other half of the same rule: a shelter whose permission was withdrawn
  // leaves the dataset even on a run that never reached its feed.
  it("drops a carried-forward listing whose provider was switched off", () => {
    const previous = buildListingAnimals(
      feed(["a", "b"]),
      new Map([["johanca", policy()]]),
      SHELTERS,
      "2026-08-01T00:00:00Z",
    ).animals;

    const { published } = runPipeline({
      crawled: [],
      listings: [],
      previousCrawled: previous,
      crawledProviderIds: new Set(),
      policies: new Map([["johanca", policy({ enabled: false })]]),
    });

    expect(published).toEqual([]);
  });
});
