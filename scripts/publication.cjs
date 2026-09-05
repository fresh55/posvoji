// Writes a layout-v2 release's private/publication.json. This is the deploy
// receipt: it adds the release id and carries forward the ingest generation id.
// It is distinct from data/dist/generation.json, which ingest writes last and
// which verify-media cryptographically validates against every receipt-bound
// JSON file and referenced media byte before this script runs.
//
// scripts/deploy.sh runs this before it uploads a release, not after: a
// release directory that pairs one run's site with another run's dataset is
// not something to notice on the host. The receipt is written here rather
// than by the ingest because the release id only exists at deploy time, out
// of the commit and the clock.
//
// Node does the JSON because jq is not on the Windows side of deploy.sh, and
// a .cjs file rather than `node -e` so the module kind is never in question.
// A file rather than a heredoc so the check below can be tested against
// fixtures without a deploy: apps/ingest/src/publication-check.test.ts.
//
// Usage: node scripts/publication.cjs <data/dist> <releaseId> <out>

const { readFileSync, writeFileSync } = require("node:fs");

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`could not read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// One export run stamps animals.json, animals.crawled.json and overrides.json
// with one generatedAt. generation.json closes the wider cross-file boundary;
// this smaller semantic check keeps the release receipt human-auditable and
// catches an impossible timestamp mix even after digest verification. Ingest
// checks the same dataset pair when it reads them back
// (apps/ingest/src/crawled-snapshot.ts).
//
// The recovery is the same one the ingest names: re-run the export, and with
// the portal integration on that means a full clean
// `pnpm dataset:export --refresh-all` over every provider.
function buildReceipt(input) {
  const { releaseId, dataset, crawled, overrides, generation } = input;

  const generatedAt = dataset.generatedAt;
  if (!isTimestamp(generatedAt)) {
    throw new Error(
      `animals.json has no usable generatedAt (${JSON.stringify(generatedAt)}). ` +
        "Re-run the export; nothing was packaged.",
    );
  }

  const disagree = [];
  if (crawled.generatedAt !== generatedAt) {
    disagree.push(
      `animals.crawled.json says ${JSON.stringify(crawled.generatedAt)}`,
    );
  }
  if (overrides.generatedAt !== generatedAt) {
    disagree.push(
      `overrides.json says ${JSON.stringify(overrides.generatedAt)}`,
    );
  }
  if (disagree.length > 0) {
    throw new Error(
      `the dataset files are not from one export run: animals.json says ` +
        `${JSON.stringify(generatedAt)} and ${disagree.join(", ")}. ` +
        "A release built from these would pair one run's site with another " +
        "run's datasets. Nothing was packaged. Re-run the export, in full " +
        "with --refresh-all if the portal integration is on.",
    );
  }

  if (
    !generation ||
    generation.version !== 1 ||
    typeof generation.generationId !== "string" ||
    !/^[a-f0-9]{64}$/.test(generation.generationId) ||
    generation.datasetGeneratedAt !== generatedAt
  ) {
    throw new Error(
      "generation.json is missing, malformed or does not name this dataset " +
        "generation. Run a complete export; nothing was packaged.",
    );
  }

  const overridesEnabled = overrides.enabled === true;
  // No timestamp is manufactured for a portal that was not consulted: with
  // the integration off there is nothing to record and the key stays out. On
  // a run that did consult it, a missing or unparseable timestamp means the
  // report cannot say which portal export was merged, and the release would
  // carry a receipt that only looks complete.
  if (overridesEnabled && !isTimestamp(overrides.portalGeneratedAt)) {
    throw new Error(
      "overrides.json says the portal integration was on but its " +
        `portalGeneratedAt is ${JSON.stringify(overrides.portalGeneratedAt)}, ` +
        "which is not a timestamp. The release receipt could not say which " +
        "portal export was merged, so nothing was packaged.",
    );
  }

  const receipt = {
    releaseId,
    generationId: generation.generationId,
    datasetGeneratedAt: generatedAt,
    overridesEnabled,
  };
  if (overridesEnabled) {
    receipt.portalGeneratedAt = overrides.portalGeneratedAt;
  }
  return receipt;
}

function main(argv) {
  const [dist, releaseId, out] = argv;
  if (!dist || !releaseId || !out) {
    throw new Error(
      "usage: node scripts/publication.cjs <data/dist> <releaseId> <out>",
    );
  }

  const receipt = buildReceipt({
    releaseId,
    dataset: readJson(`${dist}/animals.json`),
    crawled: readJson(`${dist}/animals.crawled.json`),
    // A run with the portal off still writes this file, so an unreadable one
    // is a real fault rather than a configuration that has not been set up.
    overrides: readJson(`${dist}/overrides.json`),
    // verify-media has already recomputed this receipt's JSON and media
    // digests. Carrying its id into the release receipt binds that proof to
    // the artifact the operator may inspect later.
    generation: readJson(`${dist}/generation.json`),
  });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
}

module.exports = { buildReceipt, main };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`publication: ${error.message}`);
    process.exit(1);
  }
}
