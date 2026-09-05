import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "verify-release-"));
const script = resolve("scripts/verify-release.sh").replaceAll("\\", "/");
const shQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const posix = (value) => value.replaceAll("\\", "/").replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
try {
  const site = join(root, "site");
  const bin = join(root, "bin");
  mkdirSync(join(site, "_posvoji"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(site, "index.html"), "<html>expected release</html>\n");
  writeFileSync(join(site, "_posvoji", "status.json"), '{"releaseId":"expected"}\n');
  writeFileSync(join(bin, "curl"), `#!/usr/bin/env bash
while [[ $# -gt 0 ]]; do
  if [[ $1 = --output ]]; then out=$2; shift; fi
  url=$1; shift
done
if [[ $url = */status.json ]]; then
  if [[ $SCENARIO = wrong-version ]]; then printf '{"releaseId":"old"}' >"$out"; else cp "$EXPECTED/_posvoji/status.json" "$out"; fi
else
  if [[ $SCENARIO = wrong-page ]]; then printf '<html>old</html>' >"$out"; else cp "$EXPECTED/index.html" "$out"; fi
fi
if [[ $SCENARIO = unauthorized ]]; then printf 401; else printf 200; fi
`, { mode: 0o755 });
  for (const scenario of ["healthy", "wrong-version", "wrong-page", "unauthorized"]) {
    const command = `export PATH=${shQuote(posix(bin))}:$PATH; bash ${shQuote(posix(script))} ${shQuote(posix(site))} https://posvoji.si /missing-netrc`;
    const run = spawnSync("bash", ["-c", command], { encoding: "utf8", env: { ...process.env, SCENARIO: scenario, EXPECTED: posix(site) } });
    assert.equal(run.status === 0, scenario === "healthy", `${scenario}: ${run.stdout}${run.stderr}`);
  }
  console.log("verify-release: OK");
} finally { rmSync(root, { recursive: true, force: true }); }
