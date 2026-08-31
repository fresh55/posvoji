import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repoRoot } from "./paths";

// scripts/publication.cjs is run by scripts/deploy.sh, not by the pipeline,
// but the invariant it enforces is this workspace's: animals.json,
// animals.crawled.json and overrides.json are written by one export run and
// carry one generatedAt. The check lives at the packaging end because that is
// the last point before a release is built out of all three, and it is tested
// here because this is where the three files come from.

const PUBLICATION = join(repoRoot, "scripts", "publication.cjs");

interface Receipt {
  releaseId: string;
  datasetGeneratedAt: string;
  overridesEnabled: boolean;
  portalGeneratedAt?: string;
}

interface ReceiptInput {
  releaseId: string;
  dataset: unknown;
  crawled: unknown;
  overrides: unknown;
}

const require_ = createRequire(import.meta.url);
const { buildReceipt } = require_(PUBLICATION) as {
  buildReceipt: (input: ReceiptInput) => Receipt;
};

const GENERATED_AT = "2026-08-30T06:00:00Z";
const PORTAL_AT = "2026-08-30T05:45:00Z";
const RELEASE_ID = "a1b2c3d4e5f6-20260830T070000Z";

function input(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    releaseId: RELEASE_ID,
    dataset: { generatedAt: GENERATED_AT, animals: [] },
    crawled: { generatedAt: GENERATED_AT, animals: [] },
    overrides: { generatedAt: GENERATED_AT, enabled: false },
    ...overrides,
  };
}

describe("buildReceipt", () => {
  it("writes the receipt when the three files are from one run", () => {
    expect(buildReceipt(input())).toEqual({
      releaseId: RELEASE_ID,
      datasetGeneratedAt: GENERATED_AT,
      overridesEnabled: false,
    });
  });

  it("refuses a crawled snapshot from another run", () => {
    expect(() =>
      buildReceipt(
        input({ crawled: { generatedAt: "2026-08-29T18:00:00Z", animals: [] } }),
      ),
    ).toThrow(/animals.crawled.json says/);
  });

  it("refuses an override report from another run", () => {
    expect(() =>
      buildReceipt(
        input({
          overrides: { generatedAt: "2026-08-29T18:00:00Z", enabled: false },
        }),
      ),
    ).toThrow(/overrides.json says/);
  });

  it("refuses a dataset with no usable generatedAt", () => {
    expect(() => buildReceipt(input({ dataset: { animals: [] } }))).toThrow(
      /no usable generatedAt/,
    );
  });

  it("carries the portal timestamp when the integration was on", () => {
    const receipt = buildReceipt(
      input({
        overrides: {
          generatedAt: GENERATED_AT,
          enabled: true,
          portalGeneratedAt: PORTAL_AT,
        },
      }),
    );

    expect(receipt.overridesEnabled).toBe(true);
    expect(receipt.portalGeneratedAt).toBe(PORTAL_AT);
  });

  it("refuses a portal run with no portal timestamp", () => {
    expect(() =>
      buildReceipt(
        input({ overrides: { generatedAt: GENERATED_AT, enabled: true } }),
      ),
    ).toThrow(/portalGeneratedAt/);
  });

  it("refuses a portal timestamp that is not a timestamp", () => {
    expect(() =>
      buildReceipt(
        input({
          overrides: {
            generatedAt: GENERATED_AT,
            enabled: true,
            portalGeneratedAt: "soon",
          },
        }),
      ),
    ).toThrow(/portalGeneratedAt/);
  });

  it("manufactures no portal timestamp for a run with the portal off", () => {
    const receipt = buildReceipt(
      input({
        overrides: {
          generatedAt: GENERATED_AT,
          enabled: false,
          portalGeneratedAt: PORTAL_AT,
        },
      }),
    );

    expect(receipt).not.toHaveProperty("portalGeneratedAt");
  });
});

// The same script the way deploy.sh runs it: three arguments, a data/dist on
// disk, and an exit code the shell reads. No deploy and no host involved.
describe("publication.cjs as deploy.sh runs it", () => {
  let dist: string;
  let out: string;

  function writeDist(overrides: Partial<Record<string, unknown>> = {}): void {
    const files: Record<string, unknown> = {
      "animals.json": { generatedAt: GENERATED_AT, animals: [] },
      "animals.crawled.json": { generatedAt: GENERATED_AT, animals: [] },
      "overrides.json": { generatedAt: GENERATED_AT, enabled: false },
      ...overrides,
    };
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dist, name), JSON.stringify(body, null, 2));
    }
  }

  function run(): string {
    return execFileSync(
      process.execPath,
      [PUBLICATION, dist, RELEASE_ID, out],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  }

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "posvoji-publication-"));
    dist = dir;
    out = join(dir, "publication.json");
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("writes publication.json for a consistent data/dist", () => {
    writeDist();
    run();

    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({
      releaseId: RELEASE_ID,
      datasetGeneratedAt: GENERATED_AT,
      overridesEnabled: false,
    });
  });

  it("exits nonzero and writes nothing when the run generations disagree", () => {
    writeDist({
      "animals.crawled.json": {
        generatedAt: "2026-08-29T18:00:00Z",
        animals: [],
      },
    });

    let failed = false;
    try {
      run();
    } catch (error) {
      failed = true;
      const result = error as { status?: number; stderr?: string };
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not from one export run/);
    }

    expect(failed).toBe(true);
    expect(() => readFileSync(out, "utf8")).toThrow();
  });
});
