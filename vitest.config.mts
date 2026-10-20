import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src/", import.meta.url));
const emptyModule = fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: src },
      // `server-only` lève à l'import hors du bundler Next : module vide en test.
      { find: /^server-only$/, replacement: emptyModule },
    ],
  },
  test: {
    // node par défaut ; un fichier qui rend un composant déclare `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
    // Garde-fou §12 : refuse de tourner si une URL de base vise un hôte distant.
    setupFiles: ["./test/setup/guard-db.ts"],
    maxWorkers: "50%",
    coverage: { provider: "v8", reporter: ["text"] },
  },
});
