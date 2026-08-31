// Writes a layout v2 release's private/publication.json, and refuses to write
// one for a data/dist whose files are not from a single export run.
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
// with one generatedAt. The three files are written one after another, so a
// run that stopped partway leaves a set that disagrees, and the disagreement
// is the only thing that says so: each file is valid on its own. The ingest
// checks the same pair when it reads the two datasets back
// (apps/ingest/src/crawled-snapshot.ts); this is the same invariant at the
// other end, where a release is about to be built out of all three.
//
// The recovery is the same one the ingest names: re-run the export, and with
// the portal integration on that means a full clean
// `pnpm dataset:export --refresh-all` over every provider.
function buildReceipt(input) {
  const { releaseId, dataset, crawled, overrides } = input;

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
