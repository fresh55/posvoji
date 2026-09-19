// @vitest-environment node
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { expect, test } from "vitest";

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

  expect(result.fatalErrorCount).toBe(0);
  expect(result.messages.map(({ ruleId }) => ruleId)).toEqual(
    expect.arrayContaining([
      "react/display-name",
      "jsx-a11y/no-aria-hidden-on-focusable",
      "@typescript-eslint/no-restricted-imports",
    ]),
  );
});
