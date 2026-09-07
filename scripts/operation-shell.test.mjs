import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBash, shellPath, shellQuote } from "./operation-shell.mjs";

const root = mkdtempSync(join(tmpdir(), "operations shell (spaces) "));
try {
  const path = join(root, "literal ' $ name.txt");
  writeFileSync(path, "paths survive both shells\n");
  const run = runBash(["-s"], {
    input: `bash -c ${shellQuote(`cat -- ${shellQuote(shellPath(path))}`)}\n`,
  });
  assert.equal(run.status, 0, `${run.error ?? ""}${run.stderr}`);
  assert.equal(run.stdout, "paths survive both shells\n");
  console.log("operation-shell: OK");
} finally {
  rmSync(root, { recursive: true, force: true });
}
