import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Playwright owns e2e/ and lint:shell owns scripts/; vitest would
    // otherwise pick up their spec files and run them a second time.
    exclude: [...configDefaults.exclude, "e2e/**", "scripts/**"],
  },
});
