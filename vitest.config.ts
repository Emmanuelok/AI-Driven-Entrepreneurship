import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    globals: false,
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/store/**"],
      exclude: ["src/lib/i18n.ts", "**/*.test.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
