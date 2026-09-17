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
  it("reports a cooldown beyond the provider interval as degraded and recovers when it expires", async () => {
    const h = harness();
    expect((await runExport({}, h.services)).exitCode).toBe(0);
    const start = Date.parse(NOW);
    writeFileSync(join(h.root, "host-cooldowns.json"), JSON.stringify({ "shelter.example": start + 24 * 3600000 }));
    h.services.now = () => new Date(start + 3600000);
    const held = await runExport({}, h.services);
    expect(held.exitCode).toBe(2);
    expect(held.dataset.animals.map((a) => a.id)).toEqual([animal().id]);
    expect(h.discover).toHaveBeenCalledOnce();
    expect(h.services.logger!.warn).toHaveBeenCalledWith(expect.stringContaining("host cooldown"));
    h.services.now = () => new Date(start + 24 * 3600000);
    expect((await runExport({}, h.services)).exitCode).toBe(0);
    expect(h.discover).toHaveBeenCalledTimes(2);
  });

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

  it("fails the run when the release refuses because the lock changed hands", async () => {
    const h = harness();
    // releaseArtifactLock marks its ownership refusals with this code. They
    // mean another process held the lock while we were writing data/dist, so
    // the run's own result is not to be trusted and must not reach a deploy.
    h.release.mockImplementation(() => {
      throw Object.assign(new Error("fixture ownership refusal"), {
        code: "ARTIFACT_LOCK_OWNERSHIP",
      });
    });
    await expect(runExport({}, h.services)).rejects.toThrow(
      "fixture ownership refusal",
    );
    expect(h.seal).toHaveBeenCalledOnce();
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

  it("reports a provider checked inside its interval as clean and names it once", async () => {
    const h = harness();
    const log = h.services.logger!.log as ReturnType<typeof vi.fn>;
    await runExport({}, h.services);
    expect(
      log.mock.calls.filter(([line]) => String(line).startsWith("schedule:")),
    ).toEqual([]);
    log.mockClear();
    h.services.now = () => new Date(Date.parse(NOW) + 3600000);
    const second = await runExport({}, h.services);
    expect(second.exitCode).toBe(0);
    expect(h.discover).toHaveBeenCalledOnce();
    // The line has to name the provider, say it was not due and say when it
    // next is. Asserting the derived timestamp in full would make every change
    // to the schedule arithmetic land here as a string mismatch.
    const notDue = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith("schedule:"));
    expect(notDue).toHaveLength(1);
    expect(notDue[0]).toMatch(
      /^schedule: 1 provider\(s\) not due: test-shelter \(next \d{4}-\d{2}-\d{2}T[\d:.]+Z\)$/,
    );
    expect(h.services.logger!.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("schedule:"),
    );
  });

  it("carries a provider held off by a recorded attempt alone forward as degraded", async () => {
    const h = harness([animal()]);
    h.discover.mockRejectedValueOnce(new Error("fixture outage"));
    const first = await runExport({}, h.services);
    expect(first.exitCode).toBe(2);
    // An hour later the provider is still inside its 12-hour interval although
    // no successful check of it was ever recorded, so the skip is the failed
    // attempt's doing and the run must not report it as clean.
    h.services.now = () => new Date(Date.parse(NOW) + 3600000);
    const second = await runExport({}, h.services);
    expect(second.exitCode).toBe(2);
    expect(h.discover).toHaveBeenCalledOnce();
    expect(second.dataset.animals.map((a) => a.id)).toEqual([animal().id]);
    expect(h.services.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "schedule: test-shelter is held off until 2026-09-08T22:00:00.000Z by a recorded attempt",
      ),
    );
    expect(h.services.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining("no successful check of it was ever recorded"),
    );
    const log = h.services.logger!.log as ReturnType<typeof vi.fn>;
    expect(
      log.mock.calls.filter(([line]) => String(line).startsWith("schedule:")),
    ).toEqual([]);
  });

  it("stamps a provider's attempt with the start of its crawl, not with the end", async () => {
    const h = harness();
    let clock = Date.parse(NOW);
    h.services.now = () => new Date(clock);
    // A detail phase that takes real time. The listing check is taken once,
    // right after discovery, so an attempt stamped when the crawl settled
    // would sit an hour and a half in front of the check it belongs to and
    // hold the provider past its own interval.
    h.services.providers![0]!.fetch = async (_ctx, ref) => {
      clock += 90 * 60000;
      return { ref, fetchedAt: new Date(clock).toISOString(), data: {} };
    };
    const first = await runExport({}, h.services);
    expect(first.exitCode).toBe(0);
    const checkedAt = Date.parse(NOW);
    const interval = 12 * 3600000;

    // Five minutes short of the interval the provider is not due, and the run
    // is clean because the check behind the skip is younger than the interval.
    clock = checkedAt + interval - 5 * 60000;
    const early = await runExport({}, h.services);
    expect(early.exitCode).toBe(0);
    expect(h.discover).toHaveBeenCalledOnce();
    expect(h.services.logger!.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("schedule:"),
    );

    // A minute past it the provider is due again. Stamping the attempt at the
    // end of the crawl would hold it off until 23:30 instead, and the skip
    // would then be the attempt's doing rather than the check's.
    clock = checkedAt + interval + 60000;
    const due = await runExport({}, h.services);
    expect(due.exitCode).toBe(0);
    expect(h.discover).toHaveBeenCalledTimes(2);
    expect(h.services.logger!.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("schedule:"),
    );
  });

  // A failed attempt is only ever recorded for a provider the schedule
  // admitted, so its last successful check is already at least an interval old
  // when it is written. Every skip a failed attempt causes therefore degrades
  // the run, and this is what that looks like.
  it("is degraded when a failed attempt holds off a provider whose check has aged out", async () => {
    const h = harness();
    await runExport({}, h.services);
    h.services.now = () => new Date(Date.parse(NOW) + 13 * 3600000);
    h.discover.mockRejectedValueOnce(new Error("fixture outage"));
    expect((await runExport({}, h.services)).exitCode).toBe(2);
    // The failed attempt pushes the next crawl to 25 hours after the last
    // successful check, which is past the 12-hour interval the policy asks for.
    h.services.now = () => new Date(Date.parse(NOW) + 14 * 3600000);
    const third = await runExport({}, h.services);
    expect(third.exitCode).toBe(2);
    expect(h.discover).toHaveBeenCalledTimes(2);
    expect(third.dataset.animals.map((a) => a.id)).toEqual([animal().id]);
    expect(h.services.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `its last successful check was ${NOW}, 14h ago, longer than its 12h interval`,
      ),
    );
  });

  it("rejects incompatible options without acquiring a lock", async () => {
    const h = harness();
    await expect(
      runExport({ republish: true, refreshAll: true }, h.services),
    ).rejects.toThrow(/cannot be combined/);
    expect(h.events).toEqual([]);
  });
});
