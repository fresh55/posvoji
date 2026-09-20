import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.mts",
      {
        test: {
          name: "node",
          include: [
            "apps/ingest/**/*.test.ts",
            "packages/**/*.test.ts",
            "providers/**/*.test.ts",
          ],
        },
      },
    ],
  },
});
