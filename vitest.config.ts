import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": `${root}src`,
      "@prophetic-night/night-engine": `${root}packages/night-engine/src/index.ts`,
      "@prophetic-night/shared-types": `${root}packages/shared-types/src/index.ts`,
      "@prophetic-night/prayer-providers": `${root}packages/prayer-providers/src/index.ts`,
    },
  },
  test: {
    coverage: { reporter: ["text", "html"] },
  },
});
