import { execFileSync } from "node:child_process";

// Keep internal runbooks and audits out of the tracked docs tree, even if
// somebody uses git add --force. Public additions need an explicit review here.
const publicDocs = new Set([
  "docs/ADDING-A-PROVIDER.md",
  "docs/ANIMAL-ENRICHMENT.md",
  "docs/COMMIT-CONVENTION.md",
  "docs/DATA-POLICY.md",
  "docs/MANUAL-LISTINGS.md",
  "docs/assets/logo-dark.svg",
  "docs/assets/logo.svg",
]);
const tracked = execFileSync("git", ["ls-files", "-z", "--", "docs"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
const unexpected = tracked.filter((path) => !publicDocs.has(path));
if (unexpected.length) {
  console.error(`Internal or unreviewed documentation is tracked:\n${unexpected.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Public documentation allowlist: OK");
}
