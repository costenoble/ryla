import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./scripts/vitest-setup.ts"],
    // Les tests d'isolation partagent une base : les exécuter en parallèle
    // ferait passer un tenant pour un autre.
    fileParallelism: false,
  },
});
