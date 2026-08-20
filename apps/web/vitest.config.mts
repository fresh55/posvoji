import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Playwright owns e2e/; vitest would otherwise pick up its spec files.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
