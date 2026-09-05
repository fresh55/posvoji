import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// bash -n a.sh b.sh only parses a.sh; check every executable separately.
for (const name of ["deploy", "scheduled-crawl", "verify-release", "monitor-production", "run-host-crawl", "install-host-runner"]) {
  const run = spawnSync("bash", ["-n", `scripts/${name}.sh`], { encoding: "utf8" });
  assert.equal(run.status, 0, `${name}: ${run.error ?? ""}${run.stderr}`);
}
for (const name of ["release-status", "verify-release"]) {
  const run = spawnSync(process.execPath, [`scripts/${name}.test.mjs`], { encoding: "utf8" });
  assert.equal(run.status, 0, `${name}: ${run.stdout}${run.stderr}`);
}
console.log("operations checks: OK");
