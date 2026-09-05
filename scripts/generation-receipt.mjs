import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectMediaReferences } from "./media-references.mjs";

export const GENERATION_RECEIPT_VERSION = 1;
export const GENERATION_RECEIPT_FILE = "generation.json";

// The union of generated JSON that must move as one generation. Five are read
// by deployment: animals.json and the two public manifests drive the site and
// media allowlist; animals.crawled.json is copied into layout-v2 releases;
// overrides.json builds publication.json. image-cache.json is also bound
// because standalone derivation consumes it and must not bless a partial
// export. State used only by the next full crawl is deliberately absent.
export const GENERATION_ARTIFACTS = Object.freeze([
  "animals.json",
  "animals.crawled.json",
  "image-cache.json",
  "overrides.json",
  "share-cards.json",
  "shelter-logos.json",
]);

const SHA256 = /^[a-f0-9]{64}$/;
const MEDIA_PATH = /^(animals|share|shelter-logos)\/[A-Za-z0-9._-]+$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readRegularFile(path, label) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw new Error(`generation input ${label} is not readable: ${error.message}`);
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`generation input ${label} is not a nonempty regular file`);
  }
  try {
    return readFileSync(path);
  } catch (error) {
    throw new Error(`generation input ${label} could not be read: ${error.message}`);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`generation input ${label} is not valid JSON: ${error.message}`);
  }
}

function loadArtifacts(distDir) {
  const bytes = {};
  const parsed = {};
  const names = [...GENERATION_ARTIFACTS];
  if (existsSync(join(distDir, "crawl-manifest.json"))) names.push("crawl-manifest.json");
  for (const name of names) {
    const body = readRegularFile(join(distDir, name), name);
    bytes[name] = body;
    parsed[name] = parseJson(body, name);
  }
  return { bytes, parsed };
}

function snapshotFrom(parsed) {
  const dataset = parsed["animals.json"];
  const crawled = parsed["animals.crawled.json"];
  const overrides = parsed["overrides.json"];
  const shareManifest = parsed["share-cards.json"];
  const logoManifest = parsed["shelter-logos.json"];
  const collection = collectMediaReferences(
    dataset,
    shareManifest,
    logoManifest,
  );

  for (const [name, artifact] of [
    ["animals.crawled.json", crawled],
    ["overrides.json", overrides],
  ]) {
    if (!isRecord(artifact) || artifact.generatedAt !== dataset.generatedAt) {
      throw new Error(
        `generation input ${name} is not from animals.json generation ` +
          `${JSON.stringify(dataset.generatedAt)}`,
      );
    }
  }

  const provenance = parsed["crawl-manifest.json"];
  if (provenance !== undefined) {
    if (!isRecord(provenance) || provenance.version !== 1 || provenance.generatedAt !== dataset.generatedAt ||
        !/^[a-f0-9]{40,64}$/.test(provenance.codeSha) || !SHA256.test(provenance.policyRevision) ||
        !SHA256.test(provenance.overridesRevision) || !isRecord(provenance.inputRevision) ||
        !SHA256.test(provenance.inputRevision.authority) || !Number.isSafeInteger(provenance.inputRevision.sequence) ||
        provenance.inputRevision.sequence < 1 || !isRecord(provenance.providers)) {
      throw new Error("invalid or mismatched crawl provenance manifest");
    }
    for (const [id, ref] of Object.entries(provenance.providers)) {
      if (!/^[a-z0-9-]+$/.test(id) || !isRecord(ref) || (ref.snapshotId !== null && !SHA256.test(ref.snapshotId)) ||
          (ref.checkedAt !== null && (typeof ref.checkedAt !== "string" || !Number.isFinite(Date.parse(ref.checkedAt))))) {
        throw new Error("invalid provider snapshot reference in crawl provenance");
      }
    }
  }
  return { collection, dataset, logoManifest, shareManifest };
}

function mediaDigests(mediaRoot, referenced) {
  const inspected = inspectMedia(mediaRoot, referenced);
  if (inspected.issues.length > 0) {
    throw new Error(
      `${inspected.issues.length} generation media file(s) could not be read:\n  ` +
        inspected.issues
          .map(({ relative, message }) => `${relative} (${message})`)
          .join("\n  "),
    );
  }
  return inspected.digests;
}

function inspectMedia(mediaRoot, referenced) {
  const entries = [];
  const issues = [];
  for (const relative of [...referenced.keys()].sort()) {
    if (!MEDIA_PATH.test(relative)) {
      throw new Error(`unsafe generation media path: ${JSON.stringify(relative)}`);
    }
    const path = join(mediaRoot, relative);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      issues.push({
        relative,
        kind: error?.code === "ENOENT" ? "missing" : "unreadable",
        message: error.message,
      });
      continue;
    }
    if (!stat.isFile()) {
      issues.push({
        relative,
        kind: "unsafe",
        message: "not a regular file",
      });
      continue;
    }
    if (stat.size === 0) {
      issues.push({
        relative,
        kind: "empty",
        message: "empty regular file",
      });
      continue;
    }
    try {
      entries.push([relative, digest(readFileSync(path))]);
    } catch (error) {
      issues.push({
        relative,
        kind: "unreadable",
        message: error.message,
      });
    }
  }
  return { digests: Object.fromEntries(entries), issues };
}

function artifactDigests(bytes) {
  return Object.fromEntries(
    Object.keys(bytes).map((name) => [name, digest(bytes[name])]),
  );
}

export function generationIdFor(datasetGeneratedAt, artifacts, media) {
  // Arrays make the canonical input independent of object insertion order.
  // Explicit code-unit order is identical on Windows and Linux; localeCompare
  // is host-locale-dependent and cannot define a portable digest.
  const byPath = ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0);
  const canonical = JSON.stringify({
    version: GENERATION_RECEIPT_VERSION,
    datasetGeneratedAt,
    artifacts: Object.entries(artifacts).sort(byPath),
    media: Object.entries(media).sort(byPath),
  });
  return digest(Buffer.from(canonical));
}

/** Build the last-written receipt for one complete generated snapshot. */
export function createGenerationReceipt({ distDir, mediaRoot }) {
  const loaded = loadArtifacts(distDir);
  const snapshot = snapshotFrom(loaded.parsed);
  const artifacts = artifactDigests(loaded.bytes);
  const media = mediaDigests(mediaRoot, snapshot.collection.referenced);
  const datasetGeneratedAt = snapshot.dataset.generatedAt;

  return {
    version: GENERATION_RECEIPT_VERSION,
    generationId: generationIdFor(datasetGeneratedAt, artifacts, media),
    datasetGeneratedAt,
    artifacts,
    media,
  };
}

function assertDigestRecord(value, label, expectedKeys, keyPattern) {
  if (!isRecord(value)) {
    throw new Error(`generation receipt ${label} is not an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `generation receipt ${label} does not name exactly the current snapshot`,
    );
  }
  for (const key of keys) {
    if (
      !keyPattern.test(key) ||
      typeof value[key] !== "string" ||
      !SHA256.test(value[key])
    ) {
      throw new Error(
        `generation receipt has an invalid ${label} digest for ${JSON.stringify(key)}`,
      );
    }
  }
}

function readValidationInputs({
  distDir,
  mediaRoot,
  receiptPath = join(distDir, GENERATION_RECEIPT_FILE),
}) {
  const receipt = parseJson(
    readRegularFile(receiptPath, GENERATION_RECEIPT_FILE),
    GENERATION_RECEIPT_FILE,
  );
  if (!isRecord(receipt) || receipt.version !== GENERATION_RECEIPT_VERSION) {
    throw new Error(
      `generation receipt has an unsupported version: ${JSON.stringify(receipt?.version)}`,
    );
  }
  const receiptKeys = Object.keys(receipt).sort();
  const expectedReceiptKeys = [
    "artifacts",
    "datasetGeneratedAt",
    "generationId",
    "media",
    "version",
  ];
  if (
    receiptKeys.length !== expectedReceiptKeys.length ||
    receiptKeys.some((key, index) => key !== expectedReceiptKeys[index])
  ) {
    throw new Error("generation receipt has unexpected or missing fields");
  }
  if (
    typeof receipt.generationId !== "string" ||
    !SHA256.test(receipt.generationId)
  ) {
    throw new Error("generation receipt has an invalid generationId");
  }

  const loaded = loadArtifacts(distDir);
  const snapshot = snapshotFrom(loaded.parsed);
  if (
    typeof receipt.datasetGeneratedAt !== "string" ||
    Number.isNaN(Date.parse(receipt.datasetGeneratedAt))
  ) {
    throw new Error("generation receipt has an invalid datasetGeneratedAt");
  }
  if (receipt.datasetGeneratedAt !== snapshot.dataset.generatedAt) {
    throw new Error(
      "generation receipt datasetGeneratedAt does not match animals.json",
    );
  }

  assertDigestRecord(
    receipt.artifacts,
    "artifacts",
    Object.keys(loaded.bytes),
    /^[A-Za-z0-9.-]+\.json$/,
  );
  const expectedMedia = [...snapshot.collection.referenced.keys()].sort();
  assertDigestRecord(receipt.media, "media", expectedMedia, MEDIA_PATH);

  // Check the receipt's declaration before reading mutable media. Repair mode
  // may intentionally accept a missing owned output, but never a receipt whose
  // id does not authenticate its own complete expected digest maps.
  const declaredId = generationIdFor(
    receipt.datasetGeneratedAt,
    receipt.artifacts,
    receipt.media,
  );
  if (receipt.generationId !== declaredId) {
    throw new Error(
      "generation receipt generationId does not match its declared digests",
    );
  }

  const actualArtifacts = artifactDigests(loaded.bytes);
  for (const name of Object.keys(loaded.bytes)) {
    if (receipt.artifacts[name] !== actualArtifacts[name]) {
      throw new Error(`generation receipt is stale for ${name}`);
    }
  }

  return {
    actualArtifacts,
    expectedMedia,
    mediaRoot,
    receipt,
    ...snapshot,
  };
}

function validationResult(validation) {
  return {
    collection: validation.collection,
    dataset: validation.dataset,
    logoManifest: validation.logoManifest,
    receipt: validation.receipt,
    shareManifest: validation.shareManifest,
  };
}

/**
 * Validate both the receipt shape and every byte it commits to. The returned
 * parsed snapshot lets verify-media reuse the same authoritative read.
 */
export function validateGenerationReceipt(paths) {
  const validation = readValidationInputs(paths);
  const {
    actualArtifacts,
    collection,
    expectedMedia,
    mediaRoot,
    receipt,
  } = validation;

  const actualMedia = mediaDigests(mediaRoot, collection.referenced);
  const staleMedia = expectedMedia.filter(
    (relative) => receipt.media[relative] !== actualMedia[relative],
  );
  if (staleMedia.length > 0) {
    throw new Error(
      `${staleMedia.length} generation media digest(s) are stale:\n  ` +
        staleMedia.map((relative) => `media/${relative}`).join("\n  "),
    );
  }

  const expectedId = generationIdFor(
    receipt.datasetGeneratedAt,
    actualArtifacts,
    actualMedia,
  );
  if (receipt.generationId !== expectedId) {
    throw new Error("generation receipt generationId does not match its contents");
  }

  return validationResult(validation);
}

function imageDerivativePaths(dataset, expectedMedia) {
  const masters = new Set();
  for (const animal of dataset.animals) {
    for (const image of animal.images) {
      if (
        image.rights === "cache-permitted" &&
        typeof image.cachedUrl === "string" &&
        image.cachedUrl.startsWith("/media/")
      ) {
        masters.add(image.cachedUrl.slice("/media/".length));
      }
    }
  }
  return new Set(
    expectedMedia.filter(
      (relative) => relative.startsWith("animals/") && !masters.has(relative),
    ),
  );
}

function repairablePaths(validation, repair) {
  if (repair === "image-derivatives") {
    return imageDerivativePaths(validation.dataset, validation.expectedMedia);
  }
  if (repair === "shelter-logos") {
    return new Set(
      validation.expectedMedia.filter((relative) =>
        relative.startsWith("shelter-logos/"),
      ),
    );
  }
  throw new Error(`unsupported generation repair: ${JSON.stringify(repair)}`);
}

/**
 * Validate a committed base while allowing only media outputs the named job
 * can recreate. Masters, all JSON inputs, and every unrelated media byte stay
 * strict, so a repair cannot bless a mixed export.
 */
export function validateGenerationReceiptForRepair(paths, repair) {
  const validation = readValidationInputs(paths);
  const repairable = repairablePaths(validation, repair);
  const inspected = inspectMedia(
    validation.mediaRoot,
    validation.collection.referenced,
  );
  const repairableMedia = [];
  const failures = [];

  for (const issue of inspected.issues) {
    if (repairable.has(issue.relative) && issue.kind === "missing") {
      repairableMedia.push(issue.relative);
    } else {
      failures.push(`${issue.relative} (${issue.message})`);
    }
  }
  for (const relative of validation.expectedMedia) {
    const actual = inspected.digests[relative];
    if (actual === undefined || actual === validation.receipt.media[relative]) {
      continue;
    }
    failures.push(`${relative} (digest is stale)`);
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} generation media file(s) are outside the safe ` +
        `${repair} repair slice:\n  ${failures.join("\n  ")}`,
    );
  }

  return {
    ...validationResult(validation),
    repairableMedia: [...new Set(repairableMedia)].sort(),
  };
}
