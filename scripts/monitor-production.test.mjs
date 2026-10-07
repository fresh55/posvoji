import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runBash, shellPath, shellQuote } from "./operation-shell.mjs";

const root = mkdtempSync(join(tmpdir(), "monitor-production-"));
try {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const page = '<script src="/_next/static/fixture.js"></script>\n'.repeat(3000);
  const at = new Date().toISOString();
  writeFileSync(join(root, "index.html"), page);
  writeFileSync(join(root, "status.json"), JSON.stringify({
    version: 1, releaseId: "fixture", generationId: "a".repeat(64),
    codeSha: "b".repeat(40),
    indexSha256: createHash("sha256").update(page).digest("hex"),
    datasetGeneratedAt: at,
    providers: [{ providerId: "fixture", checkedAt: at, intervalHours: 12 }],
  }));
  const success = { state: "success", lastSuccessAt: at };
  writeFileSync(join(root, "operations.json"), JSON.stringify({
    version: 1, jobs: { crawl: success, backup: success },
  }));
  writeFileSync(join(bin, "curl"), `#!/usr/bin/env bash
out=/dev/null
headers=/dev/null
fail=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) out=$2; shift ;;
    --dump-header) headers=$2; shift ;;
    --fail) fail=true ;;
  esac
  url=$1
  shift
done
status=200
[[ $url != */ni-take-strani ]] || status=404
if [[ -n "$DENIED_PATH" && $url = *"$DENIED_PATH" ]]; then status=403; fi
if [[ -n "$TIMED_OUT_PATH" && $url = *"$TIMED_OUT_PATH" ]]; then
  printf 000
  exit 28
fi
printf 'HTTP/2 %s\\r\\nContent-Encoding: gzip\\r\\n\\r\\n' "$status" >"$headers"
case "$url" in
  */_posvoji/status.json) cp "$EXPECTED/status.json" "$out" ;;
  */_posvoji/operations.json) cp "$EXPECTED/operations.json" "$out" ;;
  */ni-take-strani) printf 'Stran ne obstaja' >"$out" ;;
  */) cp "$EXPECTED/index.html" "$out" ;;
  *) : ;;
esac
printf '%s' "$status"
if [[ "$fail" = true && "$status" = 403 ]]; then exit 22; fi
`, { mode: 0o755 });
  const cases = [
    { path: "", timeout: "", expected: null },
    { path: "/_posvoji/status.json", expected: /GET https:\/\/posvoji.si\/_posvoji\/status.json failed \(HTTP 403, curl exit 22\)/ },
    { path: "/_posvoji/operations.json", expected: /GET https:\/\/posvoji.si\/_posvoji\/operations.json failed \(HTTP 403, curl exit 22\)/ },
    { path: "/models/our-cat/cat.glb", expected: /HEAD https:\/\/posvoji.si\/models\/our-cat\/cat.glb failed \(HTTP 403, curl exit 22\)/ },
    { path: "", timeout: "/ni-take-strani", expected: /GET https:\/\/posvoji.si\/ni-take-strani failed \(HTTP 000\)/ },
  ];
  for (const scenario of cases) {
    const run = runBash(["-c",
      `export PATH=${shellQuote(shellPath(bin))}:"$PATH"; bash ${shellQuote(shellPath(resolve("scripts/monitor-production.sh")))}`,
    ], { env: {
      EXPECTED: shellPath(root),
      DENIED_PATH: scenario.path,
      TIMED_OUT_PATH: scenario.timeout ?? "",
      POSVOJI_MONITOR_MODEL_ENCODING: "1",
      POSVOJI_MONITOR_NETRC_FILE: "",
    } });
    assert.equal(run.status === 0, scenario.expected === null, run.stdout + run.stderr);
    assert.doesNotMatch(run.stderr, /Broken pipe/);
    if (scenario.expected) assert.match(run.stderr, scenario.expected);
    else assert.match(run.stdout, /host jobs: OK/);
  }
  const health = readFileSync("scripts/systemd/posvoji-health.service", "utf8");
  const recovery = readFileSync("scripts/systemd/posvoji-health-recovery.service", "utf8");
  assert.match(health, /^OnSuccess=posvoji-health-recovery.service$/m);
  assert.match(recovery, /--recovered --state-directory \/var\/lib\/posvoji-alerts/);
  assert.doesNotMatch(recovery, /^OnFailure=/m);
  console.log("monitor-production: OK");
} finally {
  // This exact temporary directory is the only cleanup target.
  assert.ok(root.startsWith(join(tmpdir(), "monitor-production-")));
  rmSync(root, { recursive: true, force: true });
}
