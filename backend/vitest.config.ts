import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
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
