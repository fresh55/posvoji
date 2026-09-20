import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    name: "web",
    root: fileURLToPath(new URL(".", import.meta.url)),
    // Keep the animation optimizer tests; only the ESLint probe uses node:test.
    exclude: [...configDefaults.exclude, "e2e/**", "scripts/eslint-config.test.mjs"],
  },
});
