import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    // Argon2 hashing and index builds are real work; the 5 s default fails under a busy machine.
    testTimeout: 15_000,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry point with no logic of its own; exercised by the real-URL pass in T016.
      exclude: ["src/server.ts", "src/scripts/create-staff-cli.ts"],
      thresholds: { lines: 70 },
    },
  },
});
