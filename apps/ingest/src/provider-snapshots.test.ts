import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import { buildCrawlManifest, ProviderSnapshots, reserveInputRevision } from "./provider-snapshots";
import type { ProviderCrawlResult } from "./incremental-crawl";

const policy = ProviderPolicy.parse({
  providerId: "fixture", source: "https://shelter.invalid/", enabled: true,
  ingestion: "scrape", images: "none", descriptions: "facts-only",
  permission: { status: "granted", date: "2026-09-05" }, attribution: "Fixture shelter",
  crawl: { intervalHours: 12 },
});
const sha = "a".repeat(40);
const checkedAt = "2026-09-05T06:00:00Z";
const result: ProviderCrawlResult = {
  checkedAt, animals: [], listed: 0, fetched: 0, reused: 0, failedRefs: [], excluded: 0, fullRefresh: true,
};
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "provider-snapshots-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("provider checkpoints", () => {
  it("resumes a completed empty provider after interruption without inventing a new check", () => {
    new ProviderSnapshots(root).save(policy, sha, result);
    const resumed = new ProviderSnapshots(root).resume(policy, sha, "2026-09-04T18:00:00Z", Date.parse("2026-09-05T06:20:00Z"));
    expect(resumed).toEqual(result);
    expect(resumed?.checkedAt).toBe(checkedAt);
  });
  it("does not skip the next scheduled discovery or reuse expired work", () => {
    const store = new ProviderSnapshots(root);
    store.save(policy, sha, result);
    expect(store.resume(policy, sha, "2026-09-05T06:10:00Z", Date.parse("2026-09-05T06:20:00Z"))).toBeNull();
    expect(store.resume(policy, sha, undefined, Date.parse("2026-09-05T18:00:00Z"))).toBeNull();
  });
  it("invalidates checkpoints after code, policy or permission changes", () => {
    const store = new ProviderSnapshots(root);
    store.save(policy, sha, result);
    expect(store.read(policy, "b".repeat(40))).toBeNull();
    expect(store.read({ ...policy, attribution: "Changed" }, sha)).toBeNull();
    expect(store.read({ ...policy, enabled: false }, sha)).toBeNull();
  });
  it("rejects damaged bytes before they can become a baseline", () => {
    const store = new ProviderSnapshots(root);
    const ref = store.save(policy, sha, result);
    writeFileSync(join(root, "provider-snapshots", "fixture", `${ref.snapshotId}.json`), "{}");
    expect(() => store.read(policy, sha)).toThrow(/digest mismatch/);
  });
  it("preserves the previous completed checkpoint when a later crawl writes nothing", () => {
    const store = new ProviderSnapshots(root);
    const ref = store.save(policy, sha, result);
    expect(new ProviderSnapshots(root).read(policy, sha)?.snapshotId).toBe(ref.snapshotId);
  });
});

describe("generation provenance", () => {
  it("reserves increasing revisions durably, even for runs that never publish", () => {
    const first = reserveInputRevision(root);
    const second = reserveInputRevision(root);
    expect(second).toEqual({ authority: first.authority, sequence: first.sequence + 1 });
    expect(JSON.parse(readFileSync(join(root, "input-revision.json"), "utf8"))).toEqual(second);
  });
  it("refuses to recreate an authority after a partial restore", () => {
    writeFileSync(join(root, "crawl-manifest.json"), "{}");
    expect(() => reserveInputRevision(root)).toThrow(/restore the counter/);
  });
  it("keeps carried freshness and excludes disabled providers from the release", () => {
    const revision = reserveInputRevision(root);
    const manifest = buildCrawlManifest({
      generatedAt: "2026-09-06T18:00:00Z", inputRevision: revision, codeSha: sha,
      policies: [policy, { ...policy, providerId: "withdrawn", enabled: false }],
      references: { fixture: { snapshotId: "c".repeat(64), checkedAt } }, overrides: [],
    });
    expect(manifest.providers["fixture"]?.checkedAt).toBe(checkedAt);
    expect(manifest.providers).not.toHaveProperty("withdrawn");
    expect(manifest.inputRevision).toEqual(revision);
  });
});
