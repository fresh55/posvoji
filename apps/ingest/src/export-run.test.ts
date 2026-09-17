import { ProviderPolicy, type Animal } from "@posvoji/schema";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runExport, type ExportServices } from "./export-run";
import { writeFileAtomic } from "./write-atomic";

const NOW = "2026-09-08T10:00:00.000Z";
const BEFORE = "2026-09-07T10:00:00.000Z";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function animal(id = "one"): Animal {
  return {
    id: `test-shelter:${id}`,
    name: "Fixture animal",
    species: "dog",
    status: "available",
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://shelter.example/${id}`,
      fetchedAt: NOW,
      firstSeenAt: BEFORE,
      lastSeenAt: NOW,
    },
    shelter: {
      id: "test-shelter",
      name: "Fixture shelter",
      city: "Fixture city",
    },
    images: [],
    attribution: "Fixture shelter",
  };
}

function harness(previous: Animal[] = []) {
  const root = mkdtempSync(join(tmpdir(), "export-run-"));
  roots.push(root);
  const events: string[] = [];
  const paths = {
    datasetDir: root,
    datasetPath: join(root, "animals.json"),
    crawledDatasetPath: join(root, "animals.crawled.json"),
    overrideReportPath: join(root, "overrides.json"),
    crawlStatePath: join(root, "crawl-state.json"),
  };
  for (const path of [paths.datasetPath, paths.crawledDatasetPath]) {
    writeFileSync(
      path,
      JSON.stringify({ generatedAt: BEFORE, animals: previous }),
    );
  }
  const policy = ProviderPolicy.parse({
    providerId: "test-shelter",
    source: "https://shelter.example/",
    enabled: true,
    ingestion: "scrape",
    images: "none",
    descriptions: "full-permitted",
    logo: { use: "none" },
    permission: { status: "granted", date: "2026-01-01" },
    attribution: "Fixture shelter",
    crawl: { intervalHours: 12, excludePaths: [] },
  });
  const discover = vi.fn(async () => [
    { sourceAnimalId: "one", sourceUrl: "https://shelter.example/one" },
  ]);
  const release = vi.fn(() => {
    events.push("release");
  });
  const cacheImages = vi.fn<ExportServices["cacheImages"]>(async (animals) => {
    events.push("images");
    return {
      animals,
      fetched: 0,
      reused: 0,
      deleted: 0,
      derived: { thumbs: 0, rungs: 0, blurs: 0, avifs: 0 },
      subjects: { detected: 0, empty: 0, failed: 0 },
    };
  });
  const seal = vi.fn(() => {
    events.push("seal");
    return "a".repeat(64);
  });
  const services: Partial<ExportServices> = {
    ...paths,
    holdArtifactLock: () => {
      events.push("lock");
      return release;
    },
    getCodeSha: () => "b".repeat(40),
    now: () => new Date(NOW),
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    loadPolicies: () => ({ policies: [{ dir: root, policy }], errors: [] }),
    portalIntegrationEnabled: () => false,
    fetchPortalOverrides: async () => null,
    fetchPortalListings: async () => null,
    providers: [
      {
        id: policy.providerId,
        discover,
        fetch: async (_ctx, ref) => ({ ref, fetchedAt: NOW, data: {} }),
        normalize: async () => animal(),
      },
    ],
    cacheImages,
    loadSubjectDetector: async () => undefined,
    cacheLogos: async () => ({
      manifest: { entries: {} },
      fetched: 0,
      reused: 0,
      deleted: 0,
      discovered: {},
    }),
    writeShareCards: async () => {
      events.push("cards");
      return { written: 0, reused: 0, deleted: 0 };
    },
    writeFileAtomic: (path, data) => {
      events.push(basename(path));
      writeFileAtomic(path, data);
    },
    writeGenerationReceipt: seal,
  };
  return {
    root,
    paths,
    services,
    policy,
    events,
    discover,
    release,
    cacheImages,
    seal,
  };
}

describe("the export command's production pipeline", () => {
  it("checks a still-listed available animal's reservation on the next permitted crawl", async () => {
    const held = animal();
    held.source.fetchedAt = BEFORE;
    const h = harness([held]);
    h.services.providers![0]!.normalize = async () => ({ ...animal(), status: "reserved" });
    const result = await runExport({}, h.services);
    expect(result.dataset.animals[0]?.status).toBe("reserved");
    expect(result.dataset.animals[0]?.source.fetchedAt).toBe(NOW);
  });

  it("a forced manual refresh cannot bypass the provider interval or invent observations", async () => {
    const h = harness();
    const first = await runExport({}, h.services);
    h.services.now = () => new Date(Date.parse(NOW) + 3600000);
    const second = await runExport({ refreshAll: true }, h.services);
    expect(h.discover).toHaveBeenCalledOnce();
    expect(second.dataset.animals[0]?.source.fetchedAt).toBe(first.dataset.animals[0]?.source.fetchedAt);
    expect(h.cacheImages.mock.calls[1]?.[3]?.refreshProviderIds?.size).toBe(0);
  });

  it("keeps corrections out of crawl truth and seals only after every publication write", async () => {
    const h = harness();
    h.services.fetchPortalOverrides = async () => ({
      generatedAt: NOW,
      overrides: [
        {
          providerId: "test-shelter",
          animalId: animal().id,
          fields: { name: "Corrected fixture" },
        },
      ],
    });
    const result = await runExport({}, h.services);
    expect(result.exitCode).toBe(0);
    expect(result.dataset.animals[0]?.name).toBe("Corrected fixture");
    const snapshot = JSON.parse(
      readFileSync(h.paths.crawledDatasetPath, "utf8"),
    );
    expect(snapshot.animals[0].name).toBe("Fixture animal");
    expect(snapshot.generatedAt).toBe(result.dataset.generatedAt);
    expect(h.events).toEqual([
      "lock",
      "images",
      "cards",
      "animals.crawled.json",
      "animals.json",
      "changes.json",
      "overrides.json",
      "crawl-state.json",
      "crawl-manifest.json",
      "seal",
      "release",
    ]);
  });

  it("carries failed providers forward with a degraded exit code", async () => {
    const h = harness([animal()]);
    h.discover.mockRejectedValue(new Error("fixture outage"));
    const result = await runExport({}, h.services);
    expect(result.exitCode).toBe(2);
    expect(result.dataset.animals.map((a) => a.id)).toEqual([animal().id]);
    expect(h.seal).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("keeps a sealed run's exit code when the lock release throws", async () => {
    const h = harness();
    h.release.mockImplementation(() => {
      throw new Error("fixture release failure");
    });
    const result = await runExport({}, h.services);
    expect(result.exitCode).toBe(0);
    expect(h.seal).toHaveBeenCalledOnce();
    expect(h.services.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("fixture release failure"),
    );
  });

  it("reuses a completed provider checkpoint after a later phase fails", async () => {
    const h = harness();
    h.cacheImages.mockRejectedValueOnce(new Error("fixture media failure"));
    await expect(runExport({}, h.services)).rejects.toThrow(
      "fixture media failure",
    );
    expect(h.seal).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
    const result = await runExport({}, h.services);
    expect(result.exitCode).toBe(0);
    expect(h.discover).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledTimes(2);
  });

  it("does not seal a generation whose dataset write failed", async () => {
    const h = harness();
    h.services.writeFileAtomic = (path, data) => {
      if (path === h.paths.datasetPath) throw new Error("fixture disk failure");
      writeFileAtomic(path, data);
    };
    await expect(runExport({}, h.services)).rejects.toThrow(
      "fixture disk failure",
    );
    expect(h.seal).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
    expect(
      JSON.parse(readFileSync(h.paths.datasetPath, "utf8")).generatedAt,
    ).toBe(BEFORE);
  });

  it("rejects a manual shelter's mass removal before any media or publication writes", async () => {
    const h = harness([
      animal("one"),
      animal("two"),
      animal("three"),
      animal("four"),
    ]);
    h.policy.ingestion = "manual";
    h.services.loadShelters = () => new Map();
    h.services.fetchPortalListings = async () => ({
      generatedAt: NOW,
      providers: [h.policy.providerId],
      listings: [],
    });
    await expect(runExport({}, h.services)).rejects.toThrow(/remov/i);
    expect(h.cacheImages).not.toHaveBeenCalled();
    expect(h.seal).not.toHaveBeenCalled();
    expect(h.events).toEqual(["lock", "release"]);
  });

  it("republishes without crawling and honors an explicitly accepted manual removal", async () => {
    const h = harness([
      animal("one"),
      animal("two"),
      animal("three"),
      animal("four"),
    ]);
    h.policy.ingestion = "manual";
    h.services.loadShelters = () => new Map();
    h.services.fetchPortalListings = async () => ({
      generatedAt: NOW,
      providers: [h.policy.providerId],
      listings: [],
    });
    const result = await runExport(
      { republish: true, acceptRemovals: [h.policy.providerId] },
      h.services,
    );
    expect(result.dataset.animals).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(h.discover).not.toHaveBeenCalled();
  });

  it("rejects incompatible options without acquiring a lock", async () => {
    const h = harness();
    await expect(
      runExport({ republish: true, refreshAll: true }, h.services),
    ).rejects.toThrow(/cannot be combined/);
    expect(h.events).toEqual([]);
  });
});
