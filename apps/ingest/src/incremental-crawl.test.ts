import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import type {
  AdoptionProvider,
  ProviderContext,
  SourceAnimalRef,
} from "@posvoji/provider-sdk";
import {
  CRAWL_GENERATION,
  advanceCrawlState,
  crawlProviderIncrementally,
  forceFullRefresh,
  indexPrevious,
  policyFingerprint,
  readCrawlState,
  reuseAnimal,
  type CrawlState,
} from "./incremental-crawl";

const PROVIDER_ID = "macja-hisa";
// The last full crawl, and the clock for a run 12 hours later.
const CRAWLED_AT = "2026-08-27T06:00:00.000Z";
const RUN_AT = "2026-08-27T18:00:00.000Z";

function policy(overrides: Record<string, unknown> = {}): ProviderPolicy {
  return ProviderPolicy.parse({
    providerId: PROVIDER_ID,
    source: "https://www.macjahisa.si/muce_za_posvojitev.php",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "facts-only",
    permission: { status: "granted", date: "2026-08-18" },
    attribution: "Vir: Zavetišče Mačja hiša",
    crawl: { intervalHours: 12 },
    ...overrides,
  });
}

function ref(id: string): SourceAnimalRef {
  return { sourceAnimalId: id, sourceUrl: `https://example.si/${id}` };
}

// source is composed rather than replaced, so a test can override one
// timestamp without restating the rest of the block.
function animal(
  id: string,
  overrides: Partial<Omit<Animal, "source">> & {
    source?: Partial<Animal["source"]>;
  } = {},
): Animal {
  const { source, ...rest } = overrides;
  return Animal.parse({
    id: `${PROVIDER_ID}:${id}`,
    shelter: { id: PROVIDER_ID, name: "Zavetišče", city: "Celje" },
    species: "cat",
    name: "Luna",
    status: "available",
    images: [
      { sourceUrl: `https://img.si/${id}.jpg`, rights: "cache-permitted" },
    ],
    attribution: "Vir: Zavetišče Mačja hiša",
    ...rest,
    source: {
      providerId: PROVIDER_ID,
      sourceAnimalId: id,
      sourceUrl: `https://example.si/${id}`,
      fetchedAt: CRAWLED_AT,
      firstSeenAt: "2026-08-01T06:00:00.000Z",
      lastSeenAt: CRAWLED_AT,
      ...(source ?? {}),
    },
  });
}

// A provider that answers from memory: discover returns the refs it was given
// and fetch records what was asked for, so a test can assert on exactly which
// detail pages a crawl went for.
function stubProvider(refs: SourceAnimalRef[]): {
  provider: AdoptionProvider;
  fetched: string[];
} {
  const fetched: string[] = [];
  const provider: AdoptionProvider = {
    id: PROVIDER_ID,
    discover: async () => refs,
    fetch: async (_ctx, target) => {
      fetched.push(target.sourceAnimalId);
      return { ref: target, fetchedAt: RUN_AT, data: null };
    },
    normalize: async (_ctx, raw) =>
      animal(raw.ref.sourceAnimalId, {
        name: "Luna (fetched)",
        source: {
          providerId: PROVIDER_ID,
          sourceAnimalId: raw.ref.sourceAnimalId,
          sourceUrl: raw.ref.sourceUrl,
          fetchedAt: raw.fetchedAt,
          firstSeenAt: raw.fetchedAt,
          lastSeenAt: raw.fetchedAt,
        },
      }),
  };
  return { provider, fetched };
}

// The same stub with a detail page that will not come back: a listing the
// shelter left behind whose page 404s, or a url the guarded client refuses.
function failingProvider(
  refs: SourceAnimalRef[],
  failing: Record<string, string>,
  where: "fetch" | "normalize" = "fetch",
): { provider: AdoptionProvider; fetched: string[] } {
  const { provider, fetched } = stubProvider(refs);
  if (where === "fetch") {
    const inner = provider.fetch;
    provider.fetch = async (ctx, target) => {
      const message = failing[target.sourceAnimalId];
      if (message !== undefined) throw new Error(message);
      return inner(ctx, target);
    };
  } else {
    const inner = provider.normalize;
    provider.normalize = async (ctx, raw) => {
      const message = failing[raw.ref.sourceAnimalId];
      if (message !== undefined) throw new Error(message);
      return inner(ctx, raw);
    };
  }
  return { provider, fetched };
}

function context(overrides: Record<string, unknown> = {}): ProviderContext {
  return {
    client: {} as ProviderContext["client"],
    policy: policy(overrides),
  };
}

const now = (): Date => new Date(RUN_AT);

describe("reuseAnimal", () => {
  it("keeps firstSeenAt and fetchedAt, and moves lastSeenAt on", () => {
    const previous = animal("1");
    const reused = reuseAnimal(previous, RUN_AT);

    expect(reused.source.firstSeenAt).toBe(previous.source.firstSeenAt);
    expect(reused.source.fetchedAt).toBe(CRAWLED_AT);
    expect(reused.source.lastSeenAt).toBe(RUN_AT);
  });

  it("hands the images back the way a parser would emit them", () => {
    // What a previous run's withCachedUrls left on the record. Reusing it as
    // it stands would republish a cachedUrl this run's cache never confirmed.
    const cached = animal("1", {
      images: [
        {
          sourceUrl: "https://img.si/1.jpg",
          rights: "cache-permitted",
          cachedUrl: "/media/animals/abc.webp",
          width: 800,
          height: 600,
          widths: [320, 480, 640, 800],
          avif: true,
          blurDataURL: "data:image/webp;base64,AAAA",
        },
      ],
    });

    expect(reuseAnimal(cached, RUN_AT).images).toEqual([
      { sourceUrl: "https://img.si/1.jpg", rights: "cache-permitted" },
    ]);
  });

  it("changes nothing else about the record", () => {
    const previous = animal("1", { name: "Muri", breed: "domača" });
    const { source: _s, ...rest } = reuseAnimal(previous, RUN_AT);
    const { source: _p, ...before } = previous;
    expect(rest).toEqual(before);
  });
});

describe("indexPrevious", () => {
  it("matches a ref only on an exact id and url pair", () => {
    const held = indexPrevious([animal("1")], PROVIDER_ID);

    expect(held.get("1\nhttps://example.si/1")).toBeDefined();
    // The page moved, or the provider changed how it derives ids: both are
    // reasons to read the detail page rather than republish what we hold.
    expect(held.get("1\nhttps://example.si/1-moved")).toBeUndefined();
    expect(held.get("2\nhttps://example.si/1")).toBeUndefined();
  });

  it("ignores other providers' animals", () => {
    const other = animal("1", { source: { providerId: "muri" } });
    expect(indexPrevious([other], PROVIDER_ID).size).toBe(0);
  });
});

describe("crawlProviderIncrementally", () => {
  it("scopes root-level detail access to current discovery, never to held records", async () => {
    const current = ref("1");
    const ctx = context({ source: "https://example.si/adopt/", crawl: { intervalHours: 12, allowPaths: ["/adopt/"], discoveredUrls: "exact" } });
    const calls: string[] = [];
    ctx.client = {
      async get(url: string) { calls.push(url); return { status: 200, body: "fixture", notModified: false, headers: {} }; },
    } as ProviderContext["client"];
    const { provider } = stubProvider([current]);
    provider.discover = async (discoveryCtx) => {
      await expect(discoveryCtx.client.get(current.sourceUrl)).rejects.toThrow(/outside/);
      await discoveryCtx.client.get("/adopt/");
      return [current];
    };
    provider.fetch = async (detailCtx, target) => {
      await detailCtx.client.get(target.sourceUrl);
      await expect(detailCtx.client.get(ref("2").sourceUrl)).rejects.toThrow(/outside/);
      return { ref: target, fetchedAt: RUN_AT, data: null };
    };
    const result = await crawlProviderIncrementally(provider, ctx, { previous: [animal("1"), animal("2")], now });
    expect(result).toMatchObject({ fetched: 1, reused: 0, fullRefresh: true });
    expect(calls).toEqual(["https://example.si/adopt/", current.sourceUrl]);
  });
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies both new and recently checked animals without a force flag", async () => {
    const held = animal("1", { source: { fetchedAt: CRAWLED_AT } });
    const { provider, fetched } = stubProvider([ref("1"), ref("2")]);
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [held],
      now,
    });

    expect(fetched).toEqual(["1", "2"]);
    expect(result).toMatchObject({
      listed: 2,
      fetched: 2,
      reused: 0,
      fullRefresh: true,
    });
    // Both records come from their detail pages, including the recent one.
    expect(result.animals.map((a) => a.id)).toEqual([
      `${PROVIDER_ID}:1`,
      `${PROVIDER_ID}:2`,
    ]);
    expect(result.animals[0]!.name).toBe("Luna (fetched)");
    expect(result.animals[0]!.source.fetchedAt).toBe(RUN_AT);
    expect(result.animals[0]!.source.lastSeenAt).toBe(RUN_AT);
    expect(result.animals[1]!.name).toBe("Luna (fetched)");
  });

  it("fetches everything when the run is forced", async () => {
    const { provider, fetched } = stubProvider([ref("1"), ref("2"), ref("3")]);
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [animal("1"), animal("2"), animal("3")],
      forcedBecause: "--refresh-all",
      now,
    });

    expect(fetched).toEqual(["1", "2", "3"]);
    expect(result).toMatchObject({ fetched: 3, reused: 0, fullRefresh: true });
  });

  it("verifies old and recent details in the same run", async () => {
    const stale = animal("1", {
      source: { fetchedAt: "2026-08-01T06:00:00.000Z" },
    });
    const fresh = animal("2", { source: { fetchedAt: CRAWLED_AT } });
    const { provider, fetched } = stubProvider([ref("1"), ref("2")]);
    await crawlProviderIncrementally(provider, context(), {
      previous: [stale, fresh],
      now,
    });

    expect(fetched).toEqual(["1", "2"]);
  });

  it("does not reuse a record under a path the policy now excludes", async () => {
    const excluded = animal("1", {
      source: {
        sourceUrl: "https://example.si/privat-oddaja/1",
        fetchedAt: CRAWLED_AT,
      },
    });
    const { provider } = stubProvider([
      { sourceAnimalId: "1", sourceUrl: "https://example.si/privat-oddaja/1" },
    ]);

    const result = await crawlProviderIncrementally(
      provider,
      context({ crawl: { intervalHours: 12, excludePaths: ["/privat-oddaja/"] } }),
      { previous: [excluded], now },
    );

    expect(result.animals).toEqual([]);
    expect(result.excluded).toBe(1);
    expect(result.failedRefs).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("not fetched, not reused, not published"),
    );
  });

  it("counts a listing it fetched in full as a full refresh", async () => {
    const { provider } = stubProvider([ref("1")]);
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [],
      now,
    });
    expect(result.fullRefresh).toBe(true);
  });

  it("carries one failed animal forward and refreshes the rest", async () => {
    const { provider, fetched } = failingProvider(
      [ref("1"), ref("2"), ref("3")],
      { "2": "404 Not Found" },
    );
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [animal("1"), animal("2"), animal("3")],
      forcedBecause: "--refresh-all",
      now,
    });

    expect(fetched).toEqual(["1", "3"]);
    expect(result).toMatchObject({ listed: 3, fetched: 2, reused: 1 });
    expect(result.failedRefs).toEqual([ref("2")]);
    // The failed one ships from the record we already held, with only
    // lastSeenAt moved on, and the other two from this run's parse.
    expect(result.animals.map((a) => a.name)).toEqual([
      "Luna (fetched)",
      "Luna",
      "Luna (fetched)",
    ]);
    expect(result.animals[1]!.source.fetchedAt).toBe(CRAWLED_AT);
    expect(result.animals[1]!.source.lastSeenAt).toBe(RUN_AT);
  });

  it("is not a full refresh when a ref failed", async () => {
    const { provider } = failingProvider([ref("1"), ref("2")], {
      "2": "404 Not Found",
    });
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [animal("1"), animal("2")],
      forcedBecause: "--refresh-all",
      now,
    });

    expect(result.fullRefresh).toBe(false);
  });

  it("skips a failed ref it has never held", async () => {
    const { provider } = failingProvider([ref("1"), ref("2")], {
      "2": "404 Not Found",
    });
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [animal("1")],
      forcedBecause: "--refresh-all",
      now,
    });

    expect(result.animals.map((a) => a.id)).toEqual([`${PROVIDER_ID}:1`]);
    expect(result).toMatchObject({ listed: 2, fetched: 1, reused: 0 });
    expect(result.failedRefs).toEqual([ref("2")]);
  });

  it("drops a listed ref under an excluded path without calling it a failure", async () => {
    const excludedRef = {
      sourceAnimalId: "2",
      sourceUrl: "https://example.si/privat-oddaja/2",
    };
    const held = animal("2", {
      source: { sourceUrl: excludedRef.sourceUrl },
    });
    const { provider, fetched } = stubProvider([ref("1"), excludedRef]);

    const result = await crawlProviderIncrementally(
      provider,
      context({
        crawl: { intervalHours: 12, excludePaths: ["/privat-oddaja/"] },
      }),
      {
        previous: [animal("1"), held],
        forcedBecause: "--refresh-all",
        now,
      },
    );

    expect(fetched).toEqual(["1"]);
    expect(result.animals.map((a) => a.id)).toEqual([`${PROVIDER_ID}:1`]);
    expect(result.reused).toBe(0);
    expect(result.failedRefs).toEqual([]);
    expect(result.excluded).toBe(1);
    // Nothing the provider publishes was carried, so the crawl state may
    // advance.
    expect(result.fullRefresh).toBe(true);
  });

  it("fails the whole provider when every detail fetch failed", async () => {
    const { provider } = failingProvider([ref("1"), ref("2")], {
      "1": "socket hang up",
      "2": "socket hang up",
    });

    await expect(
      crawlProviderIncrementally(provider, context(), {
        previous: [animal("1"), animal("2")],
        forcedBecause: "--refresh-all",
        now,
      }),
    ).rejects.toThrow(/all 2 detail fetch\(es\) this run attempted failed/);
  });

  it("isolates a normalize failure the way it isolates a fetch failure", async () => {
    const { provider } = failingProvider(
      [ref("1"), ref("2")],
      { "2": "no name on the page" },
      "normalize",
    );
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [animal("1"), animal("2")],
      forcedBecause: "--refresh-all",
      now,
    });

    expect(result).toMatchObject({ fetched: 1, reused: 1, fullRefresh: false });
    expect(result.failedRefs).toEqual([ref("2")]);
    expect(result.animals.map((a) => a.name)).toEqual([
      "Luna (fetched)",
      "Luna",
    ]);
  });

  it("refreshes a previously complete listing without reporting failures", async () => {
    const { provider, fetched } = stubProvider([ref("1"), ref("2")]);
    const result = await crawlProviderIncrementally(provider, context(), {
      previous: [
        animal("1", { source: { fetchedAt: CRAWLED_AT } }),
        animal("2", { source: { fetchedAt: CRAWLED_AT } }),
      ],
      now,
    });

    expect(fetched).toEqual(["1", "2"]);
    expect(result).toMatchObject({ fetched: 2, reused: 0, fullRefresh: true });
    expect(result.failedRefs).toEqual([]);
  });

  // A misattributed animal is contained per ref like any other failure, so a
  // single-ref listing whose one animal fails identity is a provider whose
  // every detail fetch failed. It still rejects, and with the reason.
  it.each([
    {
      label: "provider",
      alter: (value: Animal): Animal => ({
        ...value,
        source: { ...value.source, providerId: "muri" },
      }),
      message: /source\.providerId.*does not match policy providerId/,
    },
    {
      label: "shelter",
      alter: (value: Animal): Animal => ({
        ...value,
        shelter: { ...value.shelter, id: "muri" },
      }),
      message: /shelter\.id.*does not match policy providerId/,
    },
    {
      label: "source animal id",
      alter: (value: Animal): Animal => ({
        ...value,
        source: { ...value.source, sourceAnimalId: "other" },
      }),
      message: /source\.sourceAnimalId.*does not match discovered id/,
    },
    {
      label: "source URL",
      alter: (value: Animal): Animal => ({
        ...value,
        source: {
          ...value.source,
          sourceUrl: "https://example.si/somewhere-else",
        },
      }),
      message: /source\.sourceUrl.*does not match discovered URL/,
    },
  ])("rejects normalized identity that changes the $label", async ({ alter, message }) => {
    const { provider } = stubProvider([ref("1")]);
    const normalize = provider.normalize;
    provider.normalize = async (ctx, raw) => alter(await normalize(ctx, raw));

    await expect(
      crawlProviderIncrementally(provider, context(), { previous: [], now }),
    ).rejects.toThrow(message);
  });
});

describe("the crawl state", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-crawl-state-"));
    path = join(dir, "crawl-state.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("reads an empty state for a file that is not there", () => {
    expect(readCrawlState(path)).toEqual({ providers: {} });
  });

  it("reads an empty state, loudly, for a file it cannot use", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    writeFileSync(path, "{ not json");
    expect(readCrawlState(path)).toEqual({ providers: {} });
    expect(console.warn).toHaveBeenCalled();
  });

  it("round-trips what advanceCrawlState wrote", () => {
    const advanced = advanceCrawlState({ providers: {} }, [policy()], RUN_AT);
    writeFileSync(path, JSON.stringify(advanced));
    expect(readCrawlState(path)).toEqual(advanced);
    expect(advanced.providers[PROVIDER_ID]).toEqual({
      generation: CRAWL_GENERATION,
      policy: policyFingerprint(policy()),
      refreshedAt: RUN_AT,
    });
  });

  it("leaves providers it was not given alone", () => {
    const before: CrawlState = {
      providers: {
        muri: { generation: 1, policy: "x", refreshedAt: "2026-08-01T00:00:00.000Z" },
      },
    };
    const after = advanceCrawlState(before, [policy()], RUN_AT);
    expect(after.providers["muri"]).toEqual(before.providers["muri"]);
    expect(after.providers[PROVIDER_ID]).toBeDefined();
  });
});

describe("forceFullRefresh", () => {
  const current: CrawlState = {
    providers: {
      [PROVIDER_ID]: {
        generation: CRAWL_GENERATION,
        policy: policyFingerprint(policy()),
        refreshedAt: CRAWLED_AT,
      },
    },
  };

  it("forces nothing when the generation and the policy still match", () => {
    expect(forceFullRefresh(current, policy(), false)).toBeUndefined();
  });

  it("forces on --refresh-all", () => {
    expect(forceFullRefresh(current, policy(), true)).toBe("--refresh-all");
  });

  it("forces for a provider with no recorded generation", () => {
    expect(forceFullRefresh({ providers: {} }, policy(), false)).toBe(
      "no recorded crawl generation",
    );
  });

  it("forces when the parser generation was bumped", () => {
    const older: CrawlState = {
      providers: {
        [PROVIDER_ID]: {
          generation: CRAWL_GENERATION - 1,
          policy: policyFingerprint(policy()),
          refreshedAt: CRAWLED_AT,
        },
      },
    };
    expect(forceFullRefresh(older, policy(), false)).toContain(
      "parser generation",
    );
  });

  it("forces when the policy changed what a record carries", () => {
    // A withdrawn caching grant reaches an image's rights only through
    // normalize, so reused records would keep the old rights until they were
    // fetched again.
    expect(
      forceFullRefresh(current, policy({ images: "none" }), false),
    ).toBe("policy.yaml changed what a record carries");
    expect(
      forceFullRefresh(current, policy({ descriptions: "full-permitted" }), false),
    ).toBe("policy.yaml changed what a record carries");
    expect(
      forceFullRefresh(current, policy({ attribution: "Vir: drugje" }), false),
    ).toBe("policy.yaml changed what a record carries");
    // A widened allowedFields only reaches an animal that is crawled again:
    // what the old list stripped is not in the record we hold.
    expect(
      forceFullRefresh(
        current,
        policy({ allowedFields: ["name", "breed"] }),
        false,
      ),
    ).toBe("policy.yaml changed what a record carries");
  });

  it("does not force on a reordered allowedFields", () => {
    const listed = policy({ allowedFields: ["name", "breed"] });
    const state: CrawlState = {
      providers: {
        [PROVIDER_ID]: {
          generation: CRAWL_GENERATION,
          policy: policyFingerprint(listed),
          refreshedAt: CRAWLED_AT,
        },
      },
    };
    expect(
      forceFullRefresh(state, policy({ allowedFields: ["breed", "name"] }), false),
    ).toBeUndefined();
  });
});
