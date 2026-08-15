import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load a fixture file from the `fixtures/` directory next to the calling test:
 * `loadFixture(import.meta.url, "list.html")`.
 */
export function loadFixture(testFileUrl: string, name: string): string {
  const dir = dirname(fileURLToPath(testFileUrl));
  return readFileSync(join(dir, "fixtures", name), "utf8");
}
