// Fetches the shelter logos on their own, without a crawl. The export run does
// this too; this entry point exists so a maintainer can refresh the logos, or
// see what discovery picked, without re-crawling every animal.
import { mkdirSync } from "node:fs";
import { PoliteClient } from "@posvoji/provider-sdk";
import { cacheLogos, logoTargets } from "./cache-logos";
import { loadPolicies } from "./policies";
import { datasetDir } from "./paths";

const USER_AGENT = "PosvojiBot/0.1 (+https://posvoji.si/bot; bot@posvoji.si)";

const { policies, errors } = loadPolicies();
if (errors.length > 0) {
  for (const { dir, message } of errors) {
    console.error(`invalid  ${dir}: ${message}`);
  }
  throw new Error("refusing to fetch with invalid provider policies");
}

const targets = logoTargets(policies.map(({ policy }) => policy));
console.log(`logos: ${targets.length} shelters permit their logo`);

mkdirSync(datasetDir, { recursive: true });
const client = new PoliteClient({ userAgent: USER_AGENT });
const result = await cacheLogos(targets, client);

console.log(
  `logos: ${result.fetched} fetched, ${result.reused} reused, ` +
    `${result.deleted} deleted`,
);
for (const [providerId, url] of Object.entries(result.discovered)) {
  console.log(`logos: ${providerId} discovered ${url} (pin it in policy.yaml)`);
}
for (const target of targets) {
  if (result.manifest.entries[target.providerId] === undefined) {
    console.warn(`logos: ${target.providerId} has no logo`);
  }
}
