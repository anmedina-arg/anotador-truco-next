import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // La capa de dominio se testea contra Postgres real (branch de test de
    // Neon), no en paralelo por archivo, para no pisarse entre tests.
    fileParallelism: false,
  },
});
