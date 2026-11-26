// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const pub = (p: string) => resolve(__dirname, "../public", p);
const swSource = readFileSync(pub("sw.js"), "utf8");

type Handler = (e: unknown) => void;
type Res = { ok: boolean; type: string; headers: Headers; clone: () => Res };
const res = (o: Partial<Res> = {}): Res => {
  const r: Res = {
    ok: true,
    type: "basic",
    headers: new Headers({ "content-type": "text/javascript" }),
    clone: () => r,
    ...o,
  };
  return r;
};

function loadSw(
  opts: { cached?: Record<string, unknown>; fetchImpl?: () => Promise<unknown> } = {},
) {
  const handlers: Record<string, Handler> = {};
  const put = vi.fn();
  const addAll = vi.fn();
  const open = vi.fn(async () => ({ put, addAll }));
  const del = vi.fn();
  const match = vi.fn(async (k: unknown) => opts.cached?.[typeof k === "string" ? k : "req"]);
  const caches = {
    open,
    match,
    keys: vi.fn(async () => ["waxline-shell-old", "waxline-shell-__BUILD_ID__"]),
    delete: del,
  };
  const self = {
    location: { href: "https://app.test/", origin: "https://app.test" },
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const fetchFn = vi.fn(opts.fetchImpl ?? (async () => res()));
  const ErrResponse = { error: () => "ERR" };
  new Function("self", "caches", "fetch", "Response", swSource)(self, caches, fetchFn, ErrResponse);
  return { handlers, put, open, addAll, del, match, fetchFn, self };
}

function fetchEvent(url: string, method = "GET", mode = "cors") {
  const respondWith = vi.fn();
  return { event: { request: { url, method, mode }, respondWith }, respondWith };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("service worker", () => {
  const apiUrls = [
    "/api/auth/session",
    "https://app.test/api/auth/session",
    "/api/staff?x=1&y=2",
    "/api/x?y=1#z",
    "/api",
    "/API/auth/session",
  ];
  for (const method of ["GET", "POST"]) {
    for (const mode of ["cors", "navigate"]) {
      for (const url of apiUrls) {
        it(`never intercepts, caches or reads caches for ${method} ${mode} ${url}`, () => {
          const sw = loadSw();
          const { event, respondWith } = fetchEvent(url, method, mode);
          sw.handlers.fetch!(event);
          expect(respondWith).not.toHaveBeenCalled();
          expect(sw.put).not.toHaveBeenCalled();
          expect(sw.open).not.toHaveBeenCalled();
          expect(sw.match).not.toHaveBeenCalled();
          expect(sw.fetchFn).not.toHaveBeenCalled();
        });
      }
    }
  }

  it("ignores non-GET and cross-origin requests", () => {
    const sw = loadSw();
    const a = fetchEvent("/assets/a-1.js", "POST");
    const b = fetchEvent("https://other.test/assets/a-1.js");
    sw.handlers.fetch!(a.event);
    sw.handlers.fetch!(b.event);
    expect(a.respondWith).not.toHaveBeenCalled();
    expect(b.respondWith).not.toHaveBeenCalled();
  });

  it("caches a good hashed asset", async () => {
    const sw = loadSw();
    const { event, respondWith } = fetchEvent("/assets/index-abc123.js");
    sw.handlers.fetch!(event);
    await respondWith.mock.calls[0]![0];
    await settle();
    expect(sw.put).toHaveBeenCalledTimes(1);
  });

  it("serves a cached asset without fetching", async () => {
    const hit = res();
    const sw = loadSw({ cached: { req: hit } });
    const { event, respondWith } = fetchEvent("/assets/index-abc123.js");
    sw.handlers.fetch!(event);
    expect(await respondWith.mock.calls[0]![0]).toBe(hit);
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });

  const bad: [string, Partial<Res>][] = [
    ["non-ok", { ok: false }],
    ["opaque", { type: "opaque" }],
    ["html fallback", { headers: new Headers({ "content-type": "text/html; charset=utf-8" }) }],
  ];
  for (const [name, o] of bad) {
    it(`does not cache a ${name} asset response`, async () => {
      const sw = loadSw({ fetchImpl: async () => res(o) });
      const { event, respondWith } = fetchEvent("/assets/gone-abc.js");
      sw.handlers.fetch!(event);
      await respondWith.mock.calls[0]![0];
      await settle();
      expect(sw.put).not.toHaveBeenCalled();
    });
  }

  it("navigation goes to the network and is never put in the cache", async () => {
    const sw = loadSw();
    const { event, respondWith } = fetchEvent("/", "GET", "navigate");
    sw.handlers.fetch!(event);
    await respondWith.mock.calls[0]![0];
    await settle();
    expect(sw.fetchFn).toHaveBeenCalledTimes(1);
    expect(sw.put).not.toHaveBeenCalled();
  });

  it("offline navigation falls back to the cached shell at /", async () => {
    const shell = res();
    const sw = loadSw({
      cached: { "/": shell },
      fetchImpl: () => Promise.reject(new Error("off")),
    });
    const { event, respondWith } = fetchEvent("/somewhere", "GET", "navigate");
    sw.handlers.fetch!(event);
    expect(await respondWith.mock.calls[0]![0]).toBe(shell);
  });

  it("offline navigation without a cached shell returns Response.error()", async () => {
    const sw = loadSw({ fetchImpl: () => Promise.reject(new Error("off")) });
    const { event, respondWith } = fetchEvent("/", "GET", "navigate");
    sw.handlers.fetch!(event);
    expect(await respondWith.mock.calls[0]![0]).toBe("ERR");
  });

  it("install precaches without any /api entry and skips waiting", async () => {
    const sw = loadSw();
    let p: Promise<unknown> = Promise.resolve();
    sw.handlers.install!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    const list = sw.addAll.mock.calls[0]![0] as string[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((u) => /api/i.test(u))).toBe(false);
    expect(list).not.toContain("/index.html");
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("activate deletes other caches and claims clients", async () => {
    const sw = loadSw();
    let p: Promise<unknown> = Promise.resolve();
    sw.handlers.activate!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect(sw.del).toHaveBeenCalledWith("waxline-shell-old");
    expect(sw.del).toHaveBeenCalledTimes(1);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe("manifest", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  it("has the required fields", () => {
    expect(m).toMatchObject({
      name: "Waxline",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "es-AR",
    });
    expect(m.short_name).toBeTruthy();
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
  });
  it("references existing icons incl. 192, 512 and maskable", () => {
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect(existsSync(pub(i.src.slice(1))), i.src).toBe(true);
  });
});
