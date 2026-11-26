import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkError, SessionLostError, apiFetch } from "./api";
import { messages } from "./messages";

const mockFetch = (impl: () => Promise<Response>) => {
  const f = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(impl);
  vi.stubGlobal("fetch", f);
  return f;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("rejects paths outside /api/", async () => {
    mockFetch(async () => new Response("x"));
    await expect(apiFetch("/other")).rejects.toBeInstanceOf(TypeError);
    await expect(apiFetch("https://evil.test/api/x")).rejects.toBeInstanceOf(TypeError);
    await expect(apiFetch("/apix")).rejects.toBeInstanceOf(TypeError);
    await expect(apiFetch("/api/../secret")).rejects.toBeInstanceOf(TypeError);
    await expect(apiFetch("/api/a/..?x=1")).rejects.toBeInstanceOf(TypeError);
    await expect(apiFetch("/api/a\\b")).rejects.toBeInstanceOf(TypeError);
  });

  it("sends same-origin credentials and no JSON header without a body", async () => {
    const f = mockFetch(async () => new Response("ok"));
    await apiFetch("/api/auth/session");
    const init = f.mock.calls[0]![1]!;
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("sets JSON content type when a body is given", async () => {
    const f = mockFetch(async () => new Response("ok"));
    await apiFetch("/api/auth/sign-in", { method: "POST", body: "{}" });
    const init = f.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("does not force JSON content type on a non-string body", async () => {
    const f = mockFetch(async () => new Response("ok"));
    await apiFetch("/api/up", { method: "POST", body: new FormData() });
    const init = f.mock.calls[0]![1]!;
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("throws SessionLostError on 401", async () => {
    mockFetch(async () => new Response(null, { status: 401 }));
    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(SessionLostError);
  });

  it("returns the 401 response when expectSessionLoss is false", async () => {
    mockFetch(async () => new Response(null, { status: 401 }));
    const res = await apiFetch("/api/x", {}, { expectSessionLoss: false });
    expect(res.status).toBe(401);
  });

  it("maps a fetch rejection to NetworkError", async () => {
    mockFetch(async () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("returns non-401 errors untouched", async () => {
    for (const status of [400, 403, 429, 500]) {
      mockFetch(async () => new Response(null, { status }));
      expect((await apiFetch("/api/x")).status).toBe(status);
    }
  });

  describe("timeout", () => {
    let seen: AbortSignal | undefined;
    const hang = () =>
      vi.stubGlobal(
        "fetch",
        (_p: string, init: RequestInit) =>
          new Promise((_, reject) =>
            (seen = init.signal!).addEventListener("abort", () =>
              reject(new DOMException("x", "AbortError")),
            ),
          ),
      );

    it("uses a 15 second timeout signal and maps the abort to NetworkError", async () => {
      const ac = new AbortController();
      const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(ac.signal);
      hang();
      const p = apiFetch("/api/x");
      expect(spy).toHaveBeenCalledWith(15_000);
      ac.abort();
      expect(seen?.aborted).toBe(true);
      await expect(p).rejects.toBeInstanceOf(NetworkError);
    });

    it("also aborts when the caller signal aborts", async () => {
      const caller = new AbortController();
      hang();
      const p = apiFetch("/api/x", { signal: caller.signal });
      caller.abort();
      expect(seen?.aborted).toBe(true);
      await expect(p).rejects.toBeInstanceOf(NetworkError);
    });
  });
});

describe("messages", () => {
  it("has no empty strings", () => {
    for (const [id, v] of Object.entries(messages)) {
      const text = typeof v === "function" ? v("Ana") : v;
      expect(text.trim(), id).not.toBe("");
    }
  });

  it("is Spanish for key ids", () => {
    expect(messages.wrongCredentials).toBe("Usuario o contraseña incorrectos.");
    expect(messages.signInButton).toBe("Ingresar");
    expect(messages.signOutButton).toBe("Salir");
    expect(messages.offline).toBe(
      "No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.",
    );
    expect(messages.welcome("Ana")).toContain("Ana");
  });

  it("keeps wrong credentials distinct from session expired", () => {
    expect(messages.wrongCredentials).not.toBe(messages.sessionExpired);
  });
});
