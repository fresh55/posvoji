import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HASH = /^[a-f0-9]{64}$/;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

export function validateStatus(value) {
  if (!value || value.version !== 1 || !/^[a-zA-Z0-9-]+$/.test(value.releaseId) ||
      !HASH.test(value.generationId) || !HASH.test(value.indexSha256) || !/^[a-f0-9]{40,64}$/.test(value.codeSha) ||
      !timestamp(value.datasetGeneratedAt)) throw new Error("invalid release status");
  if (value.inputRevision && (!HASH.test(value.inputRevision.authority) ||
      !Number.isSafeInteger(value.inputRevision.sequence) || value.inputRevision.sequence < 1)) {
    throw new Error("invalid input revision");
  }
  if (!Array.isArray(value.providers) || value.providers.some((p) =>
    !/^[a-z0-9-]+$/.test(p.providerId) || (p.checkedAt !== null && !timestamp(p.checkedAt)))) {
    throw new Error("invalid provider freshness");
  }
  return value;
}

export function createStatus(dist, releaseId, codeSha, indexPath) {
  const generation = read(join(dist, "generation.json"));
  let provenance;
  if (generation.artifacts?.["crawl-manifest.json"]) {
    const bytes = readFileSync(join(dist, "crawl-manifest.json"));
    if (createHash("sha256").update(bytes).digest("hex") !== generation.artifacts["crawl-manifest.json"]) {
      throw new Error("crawl manifest does not match the generation receipt");
    }
    provenance = JSON.parse(bytes.toString("utf8"));
    if (provenance.generatedAt !== generation.datasetGeneratedAt) throw new Error("stale crawl manifest");
  }
  return validateStatus({
    version: 1, releaseId, generationId: generation.generationId, codeSha,
    indexSha256: createHash("sha256").update(readFileSync(indexPath)).digest("hex"),
    datasetGeneratedAt: generation.datasetGeneratedAt,
    ...(provenance ? { inputRevision: provenance.inputRevision } : {}),
    providers: provenance ? Object.entries(provenance.providers).map(([providerId, p]) => ({
      providerId, checkedAt: p.checkedAt ?? null,
    })).sort((a, b) => a.providerId.localeCompare(b.providerId)) : [],
  });
}

// Called while the existing host deploy lock is held, before any media writes
// and again immediately before the flip. Hashes identify inputs; the durable
// authority/sequence orders them. Restores must preserve that authority.
export function assertNotSuperseded(current, next) {
  validateStatus(next);
  if (!current) return;
  validateStatus(current);
  if (current.inputRevision) {
    if (!next.inputRevision || current.inputRevision.authority !== next.inputRevision.authority) {
      throw new Error("input revision authority changed; reconcile the seeded crawl state before deploying");
    }
    if (next.inputRevision.sequence < current.inputRevision.sequence) throw new Error("candidate input revision is older than production");
    if (next.inputRevision.sequence === current.inputRevision.sequence && next.generationId !== current.generationId) {
      throw new Error("different generations claim the same input revision");
    }
  }
  if (Date.parse(next.datasetGeneratedAt) < Date.parse(current.datasetGeneratedAt)) {
    throw new Error("candidate dataset predates production");
  }
  const nextProviders = new Map(next.providers.map((p) => [p.providerId, p.checkedAt]));
  for (const provider of current.providers) {
    if (!provider.checkedAt || !nextProviders.has(provider.providerId)) continue;
    const nextCheck = nextProviders.get(provider.providerId);
    if (!nextCheck || Date.parse(nextCheck) < Date.parse(provider.checkedAt)) {
      throw new Error(`candidate regresses source observations for ${provider.providerId}`);
    }
  }
}

export function assertFresh(status, now = Date.now(), maxAgeHours = 30) {
  validateStatus(status);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("invalid freshness threshold");
  if (now - Date.parse(status.datasetGeneratedAt) > maxAgeHours * 3600000 || Date.parse(status.datasetGeneratedAt) > now + 300000) {
    throw new Error("pipeline dataset is stale or future-dated");
  }
  return status.providers.filter((p) => !p.checkedAt || now - Date.parse(p.checkedAt) > maxAgeHours * 3600000 || Date.parse(p.checkedAt) > now + 300000).map((p) => p.providerId);
}

export function assertOperations(value, now = Date.now()) {
  if (value?.version !== 1 || !value.jobs) throw new Error("missing host job status");
  const warnings = [];
  for (const [job, maxAgeHours, maxRunHours] of [["crawl", 30, 11], ["backup", 36, 2]]) {
    const entry = value.jobs[job];
    if (!entry || !["running", "success", "degraded", "failed"].includes(entry.state)) throw new Error(`${job}: missing job outcome`);
    if (entry.state === "failed") throw new Error(`${job}: host job failed`);
    if (!timestamp(entry.lastSuccessAt) || now - Date.parse(entry.lastSuccessAt) > maxAgeHours * 3600000 || Date.parse(entry.lastSuccessAt) > now + 300000) throw new Error(`${job}: no recent successful host job`);
    if (entry.state === "running" && (!timestamp(entry.lastStartedAt) || now - Date.parse(entry.lastStartedAt) > maxRunHours * 3600000 || Date.parse(entry.lastStartedAt) > now + 300000)) throw new Error(`${job}: host job exceeded its run window`);
    if (entry.state === "degraded" || entry.degraded === true) warnings.push(`${job}: publication succeeded with carried source data`);
  }
  return warnings;
}

function main([command, ...args]) {
  if (command === "create") {
    const [dist, releaseId, codeSha, output] = args;
    const status = createStatus(dist, releaseId, codeSha, join(dirname(dirname(output)), "index.html"));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(status)}\n`);
  } else if (command === "order") {
    const [current, next] = args;
    assertNotSuperseded(existsSync(current) ? read(current) : null, read(next));
  } else if (command === "fresh") {
    const stale = assertFresh(read(args[0]), Date.now(), Number(args[1] ?? 30));
    if (stale.length) console.log(`::warning::Shelter checks need attention: ${stale.join(", ")}`);
    if (args[2] && createHash("sha256").update(readFileSync(args[2])).digest("hex") !== read(args[0]).indexSha256) {
      throw new Error("public homepage does not match the served release status");
    }
  } else if (command === "operations") {
    for (const warning of assertOperations(read(args[0]))) console.log(`::warning::${warning}`);
  } else {
    throw new Error("usage: release-status.mjs create DIST RELEASE SHA OUTPUT | order CURRENT NEXT | fresh STATUS [HOURS]");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
