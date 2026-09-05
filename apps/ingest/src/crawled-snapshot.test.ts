import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { Dataset } from "@posvoji/schema";
import type { Animal, ChangeSet, ProviderPolicy } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { buildChangeSet } from "./changes";
import {
  assertBootstrapCrawlIsComplete,
  captureCrawledSnapshot,
  readPreviousCrawledDataset,
} from "./crawled-snapshot";
import { reuseAnimal } from "./incremental-crawl";
import { applyOverrides } from "./portal-merge";
import type { OverrideFields, PortalExportPayload } from "./portal-contract";
import type { OverrideReport } from "./portal-report";

const GENERATED_AT = "2026-08-28T06:00:00Z";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "macja-hisa:luna",
    source: {
      providerId: "macja-hisa",
      sourceUrl: "https://example.si/luna",
      fetchedAt: "2026-08-27T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-27T06:00:00Z",
    },
    shelter: { id: "macja-hisa", name: "Zavetišče", city: "Celje" },
    species: "cat",
    name: "Luna",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...overrides,
  };
}

function payload(fields: OverrideFields): PortalExportPayload {
  return {
    generatedAt: "2026-08-27T18:00:00Z",
    overrides: [
      { providerId: "macja-hisa", animalId: "macja-hisa:luna", fields },
    ],
  };
}

// Through the schema and back, which is what a file on disk does to a record.
function asWritten(animals: readonly Animal[]): Animal[] {
  const written = JSON.stringify(
    Dataset.parse({ generatedAt: GENERATED_AT, animals }),
  );
  return Dataset.parse(JSON.parse(written)).animals;
}

interface RunResult {
  // animals.crawled.json.
  crawledSnapshot: Animal[];
  // animals.json.
  published: Animal[];
  changes: ChangeSet;
}

// The steps of export.ts this split runs through, in export.ts's order and
// with export.ts's functions: the policy strip, the snapshot capture, the
// override merge, the change set against the last published file. One call is
// one run, so a test can put two of them back to back the way the scheduler
// does every twelve hours, which is the only way a feedback loop is visible at
// all.
function exportRun(input: {
  // What this run's crawl produced. An animal the incremental schedule did not
  // re-read arrives here through reuseAnimal, exactly as the crawl builds it.
  crawled: Animal[];
  previousPublished: readonly Animal[];
  portal: PortalExportPayload | null;
}): RunResult {
  const restricted = applyAllowedFields(
    input.crawled,
    new Map<string, ProviderPolicy>(),
  );
  const crawledSnapshot = captureCrawledSnapshot(restricted.animals);
  const published = input.portal
    ? applyOverrides(restricted.animals, input.portal).animals
    : restricted.animals;
  return {
    crawledSnapshot: asWritten(crawledSnapshot),
    published: asWritten(published),
    changes: buildChangeSet({
      generatedAt: GENERATED_AT,
      previous: input.previousPublished,
      current: asWritten(published),
    }),
  };
}

const LATER = "2026-08-29T06:00:00Z";

describe("captureCrawledSnapshot", () => {
  it("keeps a merged override out of the crawled snapshot", () => {
    const run = exportRun({
      crawled: [animal()],
      previousPublished: [],
      portal: payload({ name: "Luna Marija" }),
    });

    expect(run.published[0]!.name).toBe("Luna Marija");
    expect(run.crawledSnapshot[0]!.name).toBe("Luna");
  });

  it("is out of reach of a phase that writes to the animals it was handed", () => {
    const animals = [animal()];
    const snapshot = captureCrawledSnapshot(animals);

    (animals[0] as { name?: string }).name = "written later";

    expect(snapshot[0]!.name).toBe("Luna");
  });

  it("gives a reused animal the crawl's values, not the published ones", () => {
    const first = exportRun({
      crawled: [animal()],
      previousPublished: [],
      portal: payload({ name: "Luna Marija" }),
    });

    // The bug this split closes: reusing the published record republishes the
    // correction as if the shelter's own page had said it.
    expect(reuseAnimal(first.published[0]!, LATER).name).toBe("Luna Marija");

    // The animal is not due for a re-crawl, so the run reuses what the crawl
    // last said about it.
    const second = exportRun({
      crawled: [reuseAnimal(first.crawledSnapshot[0]!, LATER)],
      previousPublished: first.published,
      portal: payload({ name: "Luna Marija" }),
    });

    expect(second.crawledSnapshot[0]!.name).toBe("Luna");
    expect(second.published[0]!.name).toBe("Luna Marija");
  });

  it("reverts a cleared override on the next run without a re-crawl", () => {
    const first = exportRun({
      crawled: [animal()],
      previousPublished: [],
      portal: payload({ name: "Luna Marija" }),
    });
    const second = exportRun({
      crawled: [reuseAnimal(first.crawledSnapshot[0]!, LATER)],
      previousPublished: first.published,
      portal: payload({ name: "Luna Marija" }),
    });

    // The shelter withdraws the correction. Nothing is re-crawled.
    const third = exportRun({
      crawled: [reuseAnimal(second.crawledSnapshot[0]!, LATER)],
      previousPublished: second.published,
      portal: { generatedAt: "2026-08-29T05:00:00Z", overrides: [] },
    });

    expect(third.published[0]!.name).toBe("Luna");
    expect(third.changes.updated).toHaveLength(1);
  });

  it("reports no change for an override that is standing unchanged", () => {
    const first = exportRun({
      crawled: [animal()],
      previousPublished: [],
      portal: payload({ name: "Luna Marija" }),
    });
    const second = exportRun({
      crawled: [reuseAnimal(first.crawledSnapshot[0]!, LATER)],
      previousPublished: first.published,
      portal: payload({ name: "Luna Marija" }),
    });

    expect(second.changes.added).toHaveLength(0);
    expect(second.changes.updated).toHaveLength(0);
    expect(second.changes.removed).toHaveLength(0);
  });
});

describe("readPreviousCrawledDataset", () => {
  let dir: string;
  let crawledPath: string;
  let publishedPath: string;
  let overrideReportPath: string;
  let warn: MockInstance<typeof console.warn>;
  const published = Dataset.parse({
    generatedAt: GENERATED_AT,
    animals: [animal()],
  });

  const options = {
    portalEnabled: false,
    refreshAll: false,
    published,
    publishedPath: "",
    overrideReportPath: "",
  };

  // overrides.json as export.ts writes it. Left off disk by default, which is
  // the run that predates the report.
  function writeOverrideReport(report: Partial<OverrideReport>): void {
    writeFileSync(
      overrideReportPath,
      JSON.stringify({
        generatedAt: GENERATED_AT,
        enabled: false,
        applied: [],
        unmatched: [],
        conflicts: [],
        ...report,
      }),
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-crawled-"));
    crawledPath = join(dir, "animals.crawled.json");
    publishedPath = join(dir, "animals.json");
    overrideReportPath = join(dir, "overrides.json");
    options.publishedPath = publishedPath;
    options.overrideReportPath = overrideReportPath;
    vi.spyOn(console, "log").mockImplementation(() => {});
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // The snapshot as a run would have written it: same generatedAt as
  // animals.json, because one run stamps both.
  function writeSnapshot(generatedAt = GENERATED_AT, name = "Luna"): void {
    writeFileSync(
      crawledPath,
      JSON.stringify({ generatedAt, animals: [animal({ name })] }),
    );
  }

  it("reads the snapshot when it is there", () => {
    writeSnapshot();

    const result = readPreviousCrawledDataset(crawledPath, options);

    expect(result.dataset?.animals[0]!.name).toBe("Luna");
    expect(result.bootstrapping).toBe(false);
  });

  it("falls back to animals.json when the portal is off and no report exists", () => {
    const result = readPreviousCrawledDataset(crawledPath, options);

    expect(result.dataset).toBe(published);
    // Nothing to prove after the crawl: the last run predates the override
    // report, so it predates the portal, and the merged file and the crawl
    // are the same records.
    expect(result.bootstrapping).toBe(false);
  });

  it("falls back to animals.json when the report shows nothing was merged", () => {
    writeOverrideReport({ enabled: false, applied: [] });

    const result = readPreviousCrawledDataset(crawledPath, options);

    expect(result.dataset).toBe(published);
    expect(result.bootstrapping).toBe(false);
  });

  it("refuses to bootstrap from animals.json when the portal is on", () => {
    expect(() =>
      readPreviousCrawledDataset(crawledPath, {
        ...options,
        portalEnabled: true,
      }),
    ).toThrow(/--refresh-all/);
  });

  it("refuses a targeted bootstrap outright, --refresh-all or not", () => {
    for (const refreshAll of [false, true]) {
      expect(() =>
        readPreviousCrawledDataset(crawledPath, {
          ...options,
          portalEnabled: true,
          refreshAll,
          targetedProviderId: "macja-hisa",
        }),
      ).toThrow(/--provider macja-hisa/);
    }
  });

  it("lets a full --refresh-all bootstrap the snapshot with the portal on", () => {
    const result = readPreviousCrawledDataset(crawledPath, {
      ...options,
      portalEnabled: true,
      refreshAll: true,
    });

    expect(result.dataset).toBe(published);
    // The half of the rule that is only checkable after the crawl.
    expect(result.bootstrapping).toBe(true);
  });

  // The portal being off today says nothing about the runs that wrote
  // animals.json. overrides.json is what says whether a correction ever
  // reached it.
  describe("the portal-off fallback over a file the portal has touched", () => {
    const applied = [
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        fields: ["name"],
      },
    ];

    it("refuses when the report records an applied override", () => {
      writeOverrideReport({ enabled: true, applied });

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /portal integration is off now/,
      );
    });

    it("refuses when the report records a configured portal that applied nothing", () => {
      writeOverrideReport({ enabled: true, applied: [] });

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /--refresh-all/,
      );
    });

    it("refuses a targeted run over a file the portal has touched", () => {
      writeOverrideReport({ enabled: true, applied });

      expect(() =>
        readPreviousCrawledDataset(crawledPath, {
          ...options,
          targetedProviderId: "macja-hisa",
        }),
      ).toThrow(/--provider macja-hisa/);
    });

    it("lets --refresh-all bootstrap over it, with the crawl still to prove", () => {
      writeOverrideReport({ enabled: true, applied });

      const result = readPreviousCrawledDataset(crawledPath, {
        ...options,
        refreshAll: true,
      });

      expect(result.dataset).toBe(published);
      expect(result.bootstrapping).toBe(true);
    });

    it("treats an unreadable report as a file the portal has touched", () => {
      writeFileSync(overrideReportPath, "not json at all");

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /not valid JSON/,
      );
    });

    it("treats a report of another shape as a file the portal has touched", () => {
      writeFileSync(
        overrideReportPath,
        JSON.stringify({ generatedAt: GENERATED_AT }),
      );

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /does not have the shape/,
      );
    });
  });

  it("treats a first run as a first run whatever the portal is doing", () => {
    const result = readPreviousCrawledDataset(crawledPath, {
      ...options,
      portalEnabled: true,
      published: undefined,
    });

    expect(result.dataset).toBeUndefined();
    expect(result.bootstrapping).toBe(false);
  });

  it("refuses to run over a truncated snapshot", () => {
    writeFileSync(crawledPath, '{"generatedAt":"2026-08-28T06:00:00Z","anim');

    expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
      /not valid JSON/,
    );
  });

  it("discards a truncated snapshot when the operator asks for it", () => {
    writeFileSync(crawledPath, "not json at all");

    const result = readPreviousCrawledDataset(crawledPath, {
      ...options,
      discardPrevious: true,
    });

    expect(result.dataset).toBeUndefined();
    // A discarded snapshot is not a bootstrap: nothing stands in for it.
    expect(result.bootstrapping).toBe(false);
  });

  describe("the generation pair", () => {
    it("accepts two datasets from the same run without a word", () => {
      writeSnapshot();

      const result = readPreviousCrawledDataset(crawledPath, options);

      expect(result.dataset?.generatedAt).toBe(GENERATED_AT);
      expect(warn).not.toHaveBeenCalled();
    });

    // The snapshot is written first, so this is the run that died between the
    // two writes: recoverable, because the snapshot is the whole crawl.
    it("continues on a snapshot newer than the published dataset", () => {
      writeSnapshot("2026-08-29T06:00:00Z", "Muri");

      const result = readPreviousCrawledDataset(crawledPath, options);

      expect(result.dataset?.animals[0]!.name).toBe("Muri");
      expect(result.bootstrapping).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/changes.json has a baseline one generation old/),
      );
    });

    // The write order cannot produce this one. Somebody restored an old
    // snapshot beside a newer publication, and its records are stale.
    it("refuses a published dataset newer than the snapshot", () => {
      writeSnapshot("2026-08-27T06:00:00Z");

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /different runs, and the published one is the newer/,
      );
    });

    it("names the recovery in the message", () => {
      writeSnapshot("2026-08-27T06:00:00Z");

      expect(() => readPreviousCrawledDataset(crawledPath, options)).toThrow(
        /--refresh-all/,
      );
    });

    it("runs on the snapshot with no published dataset beside it", () => {
      writeSnapshot();

      // Recoverable: the snapshot is still crawl truth, and only the change
      // set loses its baseline for one run.
      const result = readPreviousCrawledDataset(crawledPath, {
        ...options,
        published: undefined,
      });

      expect(result.dataset?.animals[0]!.name).toBe("Luna");
      expect(result.bootstrapping).toBe(false);
    });

    it("does not check a pair the operator discarded", () => {
      writeFileSync(crawledPath, "not json at all");

      expect(
        readPreviousCrawledDataset(crawledPath, {
          ...options,
          discardPrevious: true,
        }).dataset,
      ).toBeUndefined();
    });
  });
});

describe("assertBootstrapCrawlIsComplete", () => {
  const enabledProviderIds = ["macja-hisa", "ljubljana"];

  it("passes when every enabled provider crawled and fully refreshed", () => {
    expect(() =>
      assertBootstrapCrawlIsComplete({
        failed: [],
        fullyRefreshedProviderIds: enabledProviderIds,
        enabledProviderIds,
      }),
    ).not.toThrow();
  });

  it("aborts when a provider failed, rather than carrying it forward", () => {
    expect(() =>
      assertBootstrapCrawlIsComplete({
        failed: ["ljubljana"],
        fullyRefreshedProviderIds: ["macja-hisa"],
        enabledProviderIds,
      }),
    ).toThrow(/the crawl failed for ljubljana/);
  });

  it("aborts when a provider crawled without refreshing in full", () => {
    expect(() =>
      assertBootstrapCrawlIsComplete({
        failed: [],
        fullyRefreshedProviderIds: ["macja-hisa"],
        enabledProviderIds,
      }),
    ).toThrow(/ljubljana did not re-read every listed animal/);
  });

  it("names a failed provider once, not twice", () => {
    try {
      assertBootstrapCrawlIsComplete({
        failed: ["ljubljana"],
        fullyRefreshedProviderIds: ["macja-hisa"],
        enabledProviderIds,
      });
      expect.unreachable("expected the bootstrap check to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toMatch(/did not re-read/);
      expect(message).toMatch(/--refresh-all/);
    }
  });
});
