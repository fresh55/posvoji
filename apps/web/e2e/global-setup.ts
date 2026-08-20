import { existsSync } from "node:fs";
import { join } from "node:path";

// The page renders no filters without a dataset, so every test would fail on a
// missing shelter picker. Say what is actually wrong instead.
export default function globalSetup(): void {
  const dataset = join(
    __dirname,
    "..",
    "..",
    "..",
    "data",
    "dist",
    "animals.json",
  );
  if (existsSync(dataset)) return;
  throw new Error(
    `No dataset at ${dataset}. Run "pnpm dataset:export" before the browser tests.`,
  );
}
