import { defineConfig, devices } from "@playwright/test";

// Runs against a local API (port 8080, test database) and the Vite dev server (port 5173).
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
