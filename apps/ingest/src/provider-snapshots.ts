import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Animal } from "@posvoji/schema";
import type { ProviderPolicy } from "@posvoji/schema";
import type { ProviderCrawlResult } from "./incremental-crawl";
import { writeFileAtomic } from "./write-atomic";

const HASH = /^[a-f0-9]{64}$/;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export interface InputRevision {
  authority: string;
  sequence: number;
}
export interface ProviderSnapshot {
  version: 1;
  providerId: string;
  codeSha: string;
  policyHash: string;
  checkedAt: string;
  result: ProviderCrawlResult;
}
export interface SnapshotReference {
  snapshotId: string | null;
  checkedAt: string | null;
}

export function readSnapshotReferences(root: string, generatedAt: string | undefined): Record<string, SnapshotReference> {
  const path = join(root, "crawl-manifest.json");
  if (!generatedAt || !existsSync(path)) return {};
  const manifest = json(path) as { generatedAt: string; providers: Record<string, SnapshotReference> };
  if (manifest.generatedAt !== generatedAt) return {};
  for (const [id, ref] of Object.entries(manifest.providers)) {
    if (!/^[a-z0-9-]+$/.test(id) || (ref.snapshotId !== null && !HASH.test(ref.snapshotId)) ||
        (ref.checkedAt !== null && !Number.isFinite(Date.parse(ref.checkedAt)))) {
      throw new Error("invalid provider reference in the previous crawl manifest");
    }
  }
  return manifest.providers;
}

export function policyHash(policy: ProviderPolicy): string {
  return hash(JSON.stringify(policy));
}

// The checkout artifact lock must be held. Reserve before doing work: a crash
// may leave a gap but must never allow the next run to reuse an issued number.
export function reserveInputRevision(root: string): InputRevision {
  mkdirSync(root, { recursive: true });
  const path = join(root, "input-revision.json");
  let state: InputRevision;
  if (existsSync(path)) {
    state = json(path) as InputRevision;
    if (!HASH.test(state.authority) || !Number.isSafeInteger(state.sequence) || state.sequence < 1) {
      throw new Error("input revision state is corrupt; restore it rather than resetting the authority");
    }
    state = { ...state, sequence: state.sequence + 1 };
  } else {
    // The committed manifest survives independently of the counter in backups.
    // Its presence makes a missing counter an error, not a new authority.
    if (existsSync(join(root, "crawl-manifest.json"))) {
      throw new Error("input revision state is missing beside a crawl manifest; restore the counter");
    }
    state = { authority: randomBytes(32).toString("hex"), sequence: 1 };
  }
  if (!Number.isSafeInteger(state.sequence)) throw new Error("input revision sequence exhausted");
  writeFileAtomic(path, `${JSON.stringify(state)}\n`);
  return state;
}

export class ProviderSnapshots {
  constructor(private readonly root: string) {}

  private directory(providerId: string): string {
    if (!/^[a-z0-9-]+$/.test(providerId)) throw new Error("invalid snapshot provider id");
    return join(this.root, "provider-snapshots", providerId);
  }

  read(policy: ProviderPolicy, codeSha: string): { snapshotId: string; snapshot: ProviderSnapshot } | null {
    if (!policy.enabled || policy.permission.status !== "granted") return null;
    const dir = this.directory(policy.providerId);
    if (!existsSync(join(dir, "latest.json"))) return null;
    const pointer = json(join(dir, "latest.json")) as { snapshotId: string };
    if (!HASH.test(pointer.snapshotId)) throw new Error("invalid provider snapshot reference");
    const bytes = readFileSync(join(dir, `${pointer.snapshotId}.json`));
    if (hash(bytes) !== pointer.snapshotId) throw new Error("provider snapshot digest mismatch");
    const snapshot = JSON.parse(bytes.toString("utf8")) as ProviderSnapshot;
    if (snapshot.version !== 1 || snapshot.providerId !== policy.providerId ||
        !Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error("invalid provider snapshot");
    if (snapshot.policyHash !== policyHash(policy) || snapshot.codeSha !== codeSha) return null;
    snapshot.result.animals = snapshot.result.animals.map((animal) => Animal.parse(animal));
    if (snapshot.result.animals.some((a) => a.source.providerId !== policy.providerId || a.shelter.id !== policy.providerId)) {
      throw new Error("provider snapshot contains another shelter's animal");
    }
    return { snapshotId: pointer.snapshotId, snapshot };
  }

  // Resume only work newer than the last materialized dataset. An ordinary
  // scheduled run still discovers each shelter; old checkpoints never pretend
  // a source was checked again. Two hours bounds an interrupted run's reuse.
  resume(policy: ProviderPolicy, codeSha: string, after: string | undefined, now = Date.now()): ProviderCrawlResult | null {
    const held = this.read(policy, codeSha);
    if (!held || held.snapshot.result.failedRefs.length) return null;
    const checked = Date.parse(held.snapshot.checkedAt);
    if (checked > now || now - checked > 2 * 3600000 || (after && checked <= Date.parse(after))) return null;
    return structuredClone(held.snapshot.result);
  }

  save(policy: ProviderPolicy, codeSha: string, result: ProviderCrawlResult): SnapshotReference {
    if (!policy.enabled || policy.permission.status !== "granted") throw new Error("cannot snapshot an unpermitted provider");
    if (!result.checkedAt || !Number.isFinite(Date.parse(result.checkedAt))) throw new Error("snapshot requires the real listing-check time");
    const dir = this.directory(policy.providerId);
    mkdirSync(dir, { recursive: true });
    const snapshot: ProviderSnapshot = {
      version: 1, providerId: policy.providerId, codeSha, policyHash: policyHash(policy),
      checkedAt: result.checkedAt, result: structuredClone(result),
    };
    const bytes = `${JSON.stringify(snapshot)}\n`;
    const snapshotId = hash(bytes);
    const path = join(dir, `${snapshotId}.json`);
    if (!existsSync(path)) writeFileAtomic(path, bytes);
    else if (hash(readFileSync(path)) !== snapshotId) throw new Error("existing snapshot is corrupt");
    // The immutable object lands first. A crash can leave an unreferenced
    // object, but cannot leave latest pointing at a partial object.
    writeFileAtomic(join(dir, "latest.json"), `${JSON.stringify({ snapshotId })}\n`);
    return { snapshotId, checkedAt: result.checkedAt };
  }
}

export function buildCrawlManifest(options: {
  generatedAt: string;
  inputRevision: InputRevision;
  codeSha: string;
  policies: readonly ProviderPolicy[];
  references: Record<string, SnapshotReference>;
  overrides: unknown;
  listings?: unknown;
}) {
  const policies = [...options.policies].sort((a, b) => a.providerId.localeCompare(b.providerId));
  return {
    version: 1,
    generatedAt: options.generatedAt,
    inputRevision: options.inputRevision,
    codeSha: options.codeSha,
    policyRevision: hash(JSON.stringify(policies)),
    overridesRevision: hash(JSON.stringify(options.overrides)),
    listingsRevision: hash(JSON.stringify(options.listings ?? null)),
    providers: Object.fromEntries(policies.filter((p) => p.enabled && p.permission.status === "granted").map((p) => [
      p.providerId, options.references[p.providerId] ?? { snapshotId: null, checkedAt: null },
    ])),
  };
}
