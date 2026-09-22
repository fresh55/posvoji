import { loadPolicies, validateCrawlAllowlists, crawlablePolicies } from "./policies";
import { providers } from "./registry";
import { validateProviderRegistry } from "./registry-validation";
import { loadEnrichment } from "./enrichment";
import { categoryIssues, categoryReport, loadAppearance } from "./appearance";
import { reviewedPolicyIssues } from "./reviewed-policy";

const loaded = loadPolicies();
const { policies } = loaded;
const appearance = loadAppearance();
const allowlistErrors = validateCrawlAllowlists(policies);
const errors = [
  ...loaded.errors,
  ...validateProviderRegistry(policies, providers),
  ...allowlistErrors,
  ...reviewedPolicyIssues(loadEnrichment(), appearance,
    new Map(policies.map(({ policy }) => [policy.providerId, policy])))
    .map((message) => ({ dir: "reviewed-data", message })),

];

for (const { dir, policy } of policies) {
  const state = policy.enabled ? "enabled" : "disabled";
  console.log(`ok       ${policy.providerId} (${state}) ${dir}`);
}

console.log(`crawl allowlists: ${crawlablePolicies(policies).length} providers, ${allowlistErrors.length} coverage gaps`);

const categories = categoryReport(appearance);
console.log(`colour review: ${categories.classified} classified, ${categories.paired} paired, ${categories.multicolour} multicolour`);
for (const message of categoryIssues(appearance)) {
  console.warn(`warning  colour-review: ${message}`);
}

for (const { dir, message } of errors) {
  console.error(`invalid  ${dir}: ${message}`);
}

console.log(
  `\n${policies.length} valid, ${errors.length} invalid, ` +
    `${policies.filter((p) => p.policy.enabled).length} enabled`,
);

if (errors.length > 0) process.exit(1);
