import { loadPolicies, validateCrawlAllowlists, crawlablePolicies } from "./policies";
import { providers } from "./registry";
import { validateProviderRegistry } from "./registry-validation";
import { loadEnrichment } from "./enrichment";
import { dominanceIssues, dominanceReport, loadAppearance } from "./appearance";
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
  // An error. It began as a warning because the rule was new and the 18
  // reviews breaking it were not, and failing a pipeline over data nobody
  // had yet had a chance to correct only teaches people to skip the check.
  // The review has since cleared all 18, so the concession has nothing left
  // to excuse and the check can hold the line it was written for.
  ...dominanceIssues(appearance).map((message) => ({ dir: "colour-review", message })),
];

for (const { dir, policy } of policies) {
  const state = policy.enabled ? "enabled" : "disabled";
  console.log(`ok       ${policy.providerId} (${state}) ${dir}`);
}

console.log(`crawl allowlists: ${crawlablePolicies(policies).length} providers, ${allowlistErrors.length} coverage gaps`);

const dominance = dominanceReport(appearance);
console.log(
  `colour review: ${dominance.multicolour}/${dominance.classified} multicolour, ` +
    `${dominance.judged}/${dominance.classified} white markings judged, ` +
    `${dominance.forced} filed under one colour with three or more listed`,
);

for (const { dir, message } of errors) {
  console.error(`invalid  ${dir}: ${message}`);
}

console.log(
  `\n${policies.length} valid, ${errors.length} invalid, ` +
    `${policies.filter((p) => p.policy.enabled).length} enabled`,
);

if (errors.length > 0) process.exit(1);
