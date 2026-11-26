import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { swInjectPlugin } from "./swInject";

export default defineConfig({
  plugins: [react(), swInjectPlugin()],
  server: { proxy: { "/api": "http://localhost:8080" } },
  test: {
    allowOnly: false,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/setupTests.ts", "src/**/*.test.*"],
      thresholds: { lines: 70 },
    },
  },
});
