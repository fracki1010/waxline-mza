import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

interface Rewrite {
  source: string;
  destination?: string;
  run?: { serviceId: string; region: string };
}
interface HostingConfig {
  public: string;
  rewrites: Rewrite[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}
const hosting = (JSON.parse(read("firebase.json")) as { hosting: HostingConfig }).hosting;

describe("deployment config", () => {
  it("serves frontend/dist", () => {
    expect(hosting.public).toBe("frontend/dist");
  });

  it("routes /api/** to Cloud Run before the SPA catch-all", () => {
    const api = hosting.rewrites.findIndex((r) => r.source === "/api/**");
    const spa = hosting.rewrites.findIndex((r) => r.source === "**");
    expect(hosting.rewrites[api]?.run).toEqual({ serviceId: "waxline-api", region: "us-central1" });
    expect(hosting.rewrites[spa]?.destination).toBe("/index.html");
    expect(api).toBeGreaterThanOrEqual(0);
    expect(api).toBeLessThan(spa);
  });

  it("never caches the service worker or the shell", () => {
    for (const source of ["/sw.js", "/index.html"]) {
      const entry = hosting.headers.find((h) => h.source === source);
      expect(entry?.headers).toContainEqual({ key: "Cache-Control", value: "no-cache" });
    }
  });

  it("defaults to the waxline-mza project", () => {
    const rc = JSON.parse(read(".firebaserc")) as { projects: { default: string } };
    expect(rc.projects.default).toBe("waxline-mza");
  });

  it("builds a non-root image with no baked secrets", () => {
    const dockerfile = read("backend/Dockerfile");
    expect(dockerfile).toMatch(/^USER node$/m);
    const envLines = dockerfile.split("\n").filter((l) => /^\s*(ENV|ARG)\b/.test(l));
    for (const line of envLines) expect(line).not.toMatch(/MONGO|SECRET|PASSWORD|TOKEN|KEY|URI/i);
  });

  it("keeps env files and node_modules out of the build context", () => {
    const lines = read("backend/.dockerignore").split("\n");
    expect(lines).toContain("node_modules");
    expect(lines).toContain(".env*");
  });
});
