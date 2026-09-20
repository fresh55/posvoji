import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

// Linting the real tree only proves these rules do not fire. This lints a
// deliberately bad file to prove they are still wired up at all, which is what
// the ESLint 10 compatibility shim in eslint.config.mjs can silently lose.
// It runs under lint:shell rather than vitest: loading the Next plugin stack
// costs about ten seconds, and the test suite should not pay that.
test("ESLint 10 runs the Next plugins and preserves project guardrails", async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("../", import.meta.url)),
  });
  const [result] = await eslint.lintText(
    `import React from "react";
import { Species } from "@posvoji/schema";
export default React.memo(() => (
  <button aria-hidden="true">{Species.options[0]}</button>
));`,
    { filePath: "components/dependency-compatibility-probe.tsx" },
  );

  assert.equal(result.fatalErrorCount, 0);
  const fired = result.messages.map(({ ruleId }) => ruleId);
  for (const rule of [
    "react/display-name",
    "jsx-a11y/no-aria-hidden-on-focusable",
    "@typescript-eslint/no-restricted-imports",
  ]) {
    assert.ok(fired.includes(rule), `${rule} did not fire`);
  }
});
