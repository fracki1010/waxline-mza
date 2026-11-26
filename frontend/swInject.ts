import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const STATIC = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Exact-string replacement keeps the unreplaced file valid JS for dev and tests.
export function injectSw(src: string, assetFiles: string[]): string {
  const files = [...assetFiles].sort();
  const id = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 10);
  const precache = [...STATIC, ...files.map((f) => `/assets/${f}`)];
  return src
    .replace('"__BUILD_ID__"', JSON.stringify(id))
    .replace('["__PRECACHE__"]', JSON.stringify(precache));
}

export function swInjectPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "waxline-sw-inject",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      const sw = join(outDir, "sw.js");
      writeFileSync(sw, injectSw(readFileSync(sw, "utf8"), readdirSync(join(outDir, "assets"))));
    },
  };
}
