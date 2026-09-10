import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // La capa de dominio se testea contra Postgres real (branch de test de
    // Neon), no en paralelo por archivo, para no pisarse entre tests.
    fileParallelism: false,
    // Cada test hace varios round-trips reales a Neon (y bcrypt con cost 10
    // en los fixtures de Participante) — el default de 5s queda corto bajo
    // carga, sobre todo corriendo los 3 archivos seguidos.
    testTimeout: 20000,
  },
});
