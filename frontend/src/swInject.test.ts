// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { injectSw } from "../swInject";

const src = readFileSync(join(__dirname, "../public/sw.js"), "utf8");
const cacheName = (out: string) =>
  /waxline-shell-\$\{BUILD_ID\}/.test(out) && /BUILD_ID = "(\w+)"/.exec(out)![1];

describe("injectSw", () => {
  it("replaces both placeholders and lists every asset", () => {
    const out = injectSw(src, ["a-1.js", "b-2.css"]);
    expect(out).not.toContain("__BUILD_ID__");
    expect(out).not.toContain("__PRECACHE__");
    expect(out).toContain('"/assets/a-1.js"');
    expect(out).toContain('"/assets/b-2.css"');
    expect(/PRECACHE = (\[.*\]);/.exec(out)![1]).not.toMatch(/api/i);
  });

  it("gives different cache names for different asset names, same for same", () => {
    expect(cacheName(injectSw(src, ["a-1.js"]))).not.toBe(cacheName(injectSw(src, ["a-2.js"])));
    expect(cacheName(injectSw(src, ["a-1.js"]))).toBe(cacheName(injectSw(src, ["a-1.js"])));
  });

  it("is applied by a real build", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "waxline-build-"));
    await build({
      root: join(__dirname, ".."),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
    const out = readFileSync(join(outDir, "sw.js"), "utf8");
    expect(out).not.toContain("__BUILD_ID__");
    expect(out).not.toContain("__PRECACHE__");
    for (const f of readdirSync(join(outDir, "assets"))) expect(out).toContain(`/assets/${f}`);
  }, 60000);
});
