import { loadPolicies } from "./policies.js";

const { policies, errors } = loadPolicies();

for (const { dir, policy } of policies) {
  const state = policy.enabled ? "enabled" : "disabled";
  console.log(`ok       ${policy.providerId} (${state}) — ${dir}`);
}

for (const { dir, message } of errors) {
  console.error(`invalid  ${dir}: ${message}`);
}

console.log(
  `\n${policies.length} valid, ${errors.length} invalid, ` +
    `${policies.filter((p) => p.policy.enabled).length} enabled`,
);

if (errors.length > 0) process.exit(1);
