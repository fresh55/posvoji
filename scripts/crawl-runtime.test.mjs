import assert from "node:assert/strict";
import test from "node:test";
import { runBash, shellPath, shellQuote } from "./operation-shell.mjs";
import { fileURLToPath } from "node:url";

const helper = shellQuote(shellPath(fileURLToPath(new URL("./crawl-runtime.sh", import.meta.url))));
// Linux CI has no cygpath. Substitute only the vendor's path conversion;
// Windows exercises the real Git for Windows binary.
const converter = process.platform === "win32" ? "" : [
  'cygpath() {',
  '  local value="${2//\\\\//}"',
  '  if [[ "$1" == -u && "$value" =~ ^([A-Za-z]):/(.*)$ ]]; then',
  '    printf "/%s/%s\\n" "${BASH_REMATCH[1],,}" "${BASH_REMATCH[2]}"',
  '  elif [[ "$1" == -w && "$value" =~ ^/([a-z])/(.*)$ ]]; then',
  '    value="${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"',
  '    printf "%s\\n" "${value//\\//\\\\}"',
  '  elif [[ "$1" == -w ]]; then',
  '    printf "%s\\n" "${value//\\//\\\\}"',
  '  else',
  '    printf "%s\\n" "$value"',
  '  fi',
  '}',
].join("\n");

function runtime(settings) {
  return runBash(["-c", `set -eu
    source ${helper}
    ${converter}
    unset HOME USERPROFILE APPDATA LOCALAPPDATA TMP TEMP TMPDIR PNPM_HOME POSVOJI_NODE_DIR ProgramFiles PROGRAMFILES SystemRoot SYSTEMROOT
    ${settings}
    configure_crawl_runtime
    printf '%s\\n' "$HOME" "$USERPROFILE" "$APPDATA" "$TMPDIR" "$TMP" "$PATH" "$POWERSHELL"
  `]);
}

test("uses another task owner's profile, including spaces and a different drive", () => {
  const result = runtime(String.raw`
    USERPROFILE='D:\Automation\Crawl Operator'
    ProgramFiles='D:\Programs'
    SystemRoot='D:\Windows'
  `);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines[0], "/d/Automation/Crawl Operator");
  assert.equal(lines[1], "D:\\Automation\\Crawl Operator");
  assert.equal(lines[2], "D:\\Automation\\Crawl Operator\\AppData\\Roaming");
  assert.equal(lines[3], "/d/Automation/Crawl Operator/AppData/Local/Temp");
  assert.equal(lines[4], "D:\\Automation\\Crawl Operator\\AppData\\Local\\Temp");
  assert.ok(lines[5].startsWith("/d/Programs/nodejs:/d/Automation/Crawl Operator/AppData/Roaming/npm:"));
  assert.equal(lines[6], "/d/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
});

test("preserves explicit home, temporary directory and toolchain settings", () => {
  const result = runtime(String.raw`
    HOME='/d/runner'
    APPDATA='D:\roaming'
    LOCALAPPDATA='D:\local'
    TMPDIR='D:\temp space'
    POSVOJI_NODE_DIR='E:\Node custom'
    PNPM_HOME='E:\pnpm'
    ProgramFiles='D:\Programs'
    SystemRoot='D:\Windows'
  `);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines[0], "/d/runner");
  assert.equal(lines[2], "D:\\roaming");
  assert.equal(lines[3], "/d/temp space");
  assert.ok(lines[5].startsWith("/e/Node custom:/e/pnpm:"));
});

test("fails before running a crawl when the profile or Windows environment is absent", () => {
  for (const settings of ["", "USERPROFILE='D:\\runner'"]) {
    const result = runtime(settings);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /crawl task needs/u);
  }
});
