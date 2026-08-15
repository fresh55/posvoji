import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// loadFixture(import.meta.url, "list.html") reads from ./fixtures next to the test.
export function loadFixture(testFileUrl: string, name: string): string {
  const dir = dirname(fileURLToPath(testFileUrl));
  return readFileSync(join(dir, "fixtures", name), "utf8");
}
