import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SHELTER_LOGOS_DIR = join(process.cwd(), "public", "shelter-logos");

// Read at build time so the dialog never risks a runtime 404: adding a logo
// is dropping <shelter-id>.svg into public/shelter-logos and rebuilding.
export function getShelterLogoIds(): string[] {
  if (!existsSync(SHELTER_LOGOS_DIR)) return [];
  return readdirSync(SHELTER_LOGOS_DIR)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.slice(0, -".svg".length));
}
