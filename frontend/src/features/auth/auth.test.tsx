import {
  MutationObserver,
  QueryClientProvider,
  focusManager,
  type QueryClient,
} from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { apiFetch } from "../../shared/api";
import { messages } from "../../shared/messages";
import { SESSION_KEY, createQueryClient } from "../../shared/queryClient";

type Handler = (req: { body: unknown }) => Response | Promise<Response>;
let routes: Record<string, Handler>;
let calls: string[];
let client: QueryClient;

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });
const err = (status: number, code: string) => json(status, { error: { code, message: "x" } });
const USER = { id: "1", displayName: "Ana" };
const ME = () => json(200, { user: USER });
const NO_SESSION = () => err(401, "UNAUTHENTICATED");
const offline = () => {
  throw new TypeError("offline");
};
const SLOW = { timeout: 3000 }; // /me retries once after 500 ms
const count = (key: string) => calls.filter((c) => c === key).length;

function gate() {
  let release!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (release = r));
  return { promise, release: (r: Response) => act(async () => release(r)) };
}
const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

beforeEach(() => {
  routes = {};
  calls = [];
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push(key);
    const handler = routes[key];
    if (!handler) return Promise.reject(new Error(`unrouted ${key}`));
    return handler({ body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
  });
  client = createQueryClient();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

const mount = (strict = false) => {
  const tree: ReactNode = (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const submit = (user = "ana", pass = "secret-pass") => {
  fireEvent.change(screen.getByLabelText(messages.usernameLabel), { target: { value: user } });
  fireEvent.change(screen.getByLabelText(messages.passwordLabel), { target: { value: pass } });
  fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
};
const signedOut = async () => {
  routes["GET /api/auth/me"] = NO_SESSION;
  mount();
  await screen.findByLabelText(messages.usernameLabel);
};
const signedIn = async (strict = false) => {
  routes["GET /api/auth/me"] = ME;
  mount(strict);
  await screen.findByText(messages.welcome("Ana"));
};
const refetchMe = () => client.refetchQueries({ queryKey: SESSION_KEY });
const signOutClick = () =>
  fireEvent.click(screen.getByRole("button", { name: messages.signOutButton }));
const expectSignIn = async () =>
  expect(await screen.findByLabelText(messages.usernameLabel)).toBeInTheDocument();

describe("session guard", () => {
  it("shows a loading status while /me is pending", async () => {
    const g = gate();
    routes["GET /api/auth/me"] = () => g.promise;
    mount();
    await waitFor(() => expect(count("GET /api/auth/me")).toBe(1));
    expect(screen.getByRole("status")).toBeInTheDocument();
    await g.release(NO_SESSION());
    await expectSignIn();
    expect(screen.queryByText(messages.loading)).not.toBeInTheDocument();
  });

  it("shows sign-in on 401 without a session-lost message (AC4)", async () => {
    await signedOut();
    expect(screen.queryByText(messages.sessionExpired)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(client.getQueryData(SESSION_KEY)).toBeNull();
  });

  it("shows the name when already signed in (StrictMode)", async () => {
    await signedIn(true);
    expect(count("GET /api/auth/me")).toBeGreaterThanOrEqual(1);
  });

  it("shows a retry state on first-load network failure, and retry works", async () => {
    routes["GET /api/auth/me"] = offline;
    mount();
    expect(await screen.findByText(messages.offline, undefined, SLOW)).toBeInTheDocument();
    routes["GET /api/auth/me"] = ME;
    fireEvent.click(screen.getByRole("button", { name: messages.retryButton }));
    expect(await screen.findByText(messages.welcome("Ana"))).toBeInTheDocument();
  });

  it.each([
    ["a 500", () => err(500, "INTERNAL_ERROR")],
    ["a 200 with an empty object", () => json(200, {})],
    ["a 200 that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("shows a generic error with retry on %s", async (_n, handler) => {
    routes["GET /api/auth/me"] = handler;
    mount();
    expect(await screen.findByText(messages.genericError, undefined, SLOW)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.retryButton })).toBeInTheDocument();
  });

  it("retries /me once: a dropped request then success shows the app", async () => {
    let n = 0;
    routes["GET /api/auth/me"] = () => (n++ === 0 ? offline() : ME());
    mount();
    expect(await screen.findByText(messages.welcome("Ana"), undefined, SLOW)).toBeInTheDocument();
    expect(n).toBe(2);
  });

  it("does not retry a 401", async () => {
    await signedOut();
    await tick();
    expect(count("GET /api/auth/me")).toBe(1);
  });

  it.each([
    ["a network failure", offline],
    ["a 500", () => err(500, "INTERNAL_ERROR")],
  ])("keeps the app visible when a background refetch fails with %s", async (_n, handler) => {
    await signedIn(true);
    routes["GET /api/auth/me"] = handler;
    await act(async () => void (await refetchMe()));
    await tick();
    expect(client.getQueryState(SESSION_KEY)?.status).toBe("error");
    expect(screen.getByText(messages.welcome("Ana"))).toBeInTheDocument();
    expect(screen.queryByText(messages.retryButton)).not.toBeInTheDocument();
  });

  it("refetches /me on focus (stale tab) and returns to sign-in on 401", async () => {
    await signedIn();
    routes["GET /api/auth/me"] = NO_SESSION;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await expectSignIn();
    expect(count("GET /api/auth/me")).toBe(2);
  });

  it("purges other cached data when /me answers 401", async () => {
    await signedIn();
    client.setQueryData(["private"], { secret: 1 });
    routes["GET /api/auth/me"] = NO_SESSION;
    await act(async () => void (await refetchMe()));
    await expectSignIn();
    expect(client.getQueryData(["private"])).toBeUndefined();
  });

  it("revalidates the session when a page is restored from the bfcache", async () => {
    await signedIn();
    routes["GET /api/auth/me"] = NO_SESSION;
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    });
    await tick();
    expect(count("GET /api/auth/me")).toBe(1);
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    await expectSignIn();
    expect(count("GET /api/auth/me")).toBe(2);
  });

  it("stops listening to pageshow after unmount", async () => {
    routes["GET /api/auth/me"] = ME;
    const view = mount();
    await screen.findByText(messages.welcome("Ana"));
    view.unmount();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await tick();
    expect(count("GET /api/auth/me")).toBe(1);
  });

  it("falls back to sign-in when another query hits a 401 mid-session", async () => {
    routes["GET /api/other"] = NO_SESSION;
    await signedIn();
    client.setQueryData(["private"], { secret: 1 });
    await act(async () => {
      await client
        .fetchQuery({ queryKey: ["x"], queryFn: () => apiFetch("/api/other") })
        .catch(() => {});
    });
    await expectSignIn();
    expect(client.getQueryData(["private"])).toBeUndefined();
  });

  it("falls back to sign-in when a mutation hits a 401 mid-session", async () => {
    routes["POST /api/other"] = NO_SESSION;
    await signedIn();
    await act(async () => {
      await new MutationObserver(client, {
        mutationFn: () => apiFetch("/api/other", { method: "POST" }),
      })
        .mutate()
        .catch(() => {});
    });
    await expectSignIn();
  });
});

describe("races with an in-flight /me", () => {
  it("(a) a late /me 200 after sign-out stays signed out", async () => {
    await signedIn();
    const g = gate();
    routes["GET /api/auth/me"] = () => g.promise;
    routes["POST /api/auth/sign-out"] = () => json(204);
    void act(() => void refetchMe());
    signOutClick();
    await expectSignIn();
    await g.release(ME());
    await tick();
    expect(screen.queryByText(messages.welcome("Ana"))).not.toBeInTheDocument();
    expect(client.getQueryData(SESSION_KEY)).toBeNull();
  });

  it("(b) a late /me 401 after sign-in stays signed in", async () => {
    const g = gate();
    routes["GET /api/auth/me"] = () => g.promise;
    mount();
    await waitFor(() => expect(count("GET /api/auth/me")).toBe(1));
    routes["POST /api/auth/sign-in"] = () => json(200, { user: USER });
    await g.release(NO_SESSION());
    await expectSignIn();
    const g2 = gate();
    routes["GET /api/auth/me"] = () => g2.promise;
    void act(() => void refetchMe());
    await waitFor(() => expect(count("GET /api/auth/me")).toBe(2));
    submit();
    expect(await screen.findByText(messages.welcome("Ana"))).toBeInTheDocument();
    await g2.release(NO_SESSION());
    await tick();
    expect(screen.getByText(messages.welcome("Ana"))).toBeInTheDocument();
  });

  it("(c) a late /me 200 after a mid-session 401 elsewhere stays signed out", async () => {
    routes["GET /api/other"] = NO_SESSION;
    await signedIn();
    const g = gate();
    routes["GET /api/auth/me"] = () => g.promise;
    void act(() => void refetchMe());
    await act(async () => {
      await client
        .fetchQuery({ queryKey: ["x"], queryFn: () => apiFetch("/api/other") })
        .catch(() => {});
    });
    await expectSignIn();
    await g.release(ME());
    await tick();
    expect(screen.queryByText(messages.welcome("Ana"))).not.toBeInTheDocument();
  });
});

describe("sign-in", () => {
  it("renders an accessible form", async () => {
    await signedOut();
    const user = screen.getByLabelText(messages.usernameLabel);
    const pass = screen.getByLabelText(messages.passwordLabel);
    expect(user).toHaveAttribute("name", "username");
    expect(user).toHaveAttribute("autocomplete", "username");
    expect(user).toHaveAttribute("autocapitalize", "none");
    expect(user).toHaveAttribute("autocorrect", "off");
    expect(user).toHaveAttribute("spellcheck", "false");
    expect(pass).toHaveAttribute("name", "password");
    expect(pass).toHaveAttribute("autocomplete", "current-password");
    expect(pass).toHaveAttribute("type", "password");
  });

  it("signs in and shows the name (AC1), posting the body once (StrictMode)", async () => {
    routes["GET /api/auth/me"] = NO_SESSION;
    mount(true);
    await screen.findByLabelText(messages.usernameLabel);
    let body: unknown;
    routes["POST /api/auth/sign-in"] = (req) => {
      body = req.body;
      return json(200, { user: USER });
    };
    submit();
    expect(await screen.findByText(messages.welcome("Ana"))).toBeInTheDocument();
    expect(body).toEqual({ username: "ana", password: "secret-pass" });
    expect(count("POST /api/auth/sign-in")).toBe(1);
    expect(client.getQueryData(SESSION_KEY)).toEqual(USER);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(screen.queryByText(messages.sessionExpired)).not.toBeInTheDocument();
  });

  it("purges other cached data on sign-in", async () => {
    await signedOut();
    client.setQueryData(["private"], { secret: 1 });
    routes["POST /api/auth/sign-in"] = () => json(200, { user: USER });
    submit();
    await screen.findByText(messages.welcome("Ana"));
    expect(client.getQueryData(["private"])).toBeUndefined();
  });

  it("wrong password shows wrongCredentials, not session-lost, and clears the password (AC2)", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(401, "INVALID_CREDENTIALS");
    submit("ana", "bad-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.wrongCredentials);
    expect(screen.queryByText(messages.sessionExpired)).not.toBeInTheDocument();
    expect(screen.getByLabelText(messages.passwordLabel)).toHaveValue("");
    expect(screen.getByLabelText(messages.usernameLabel)).toHaveValue("ana");
  });

  it.each([
    ["locked", () => err(429, "LOCKED"), messages.locked, true],
    ["busy", () => err(429, "TOO_MANY_REQUESTS"), messages.serverBusy, false],
    ["validation", () => err(400, "VALIDATION_ERROR"), messages.validationRequired, false],
    ["server error", () => err(500, "INTERNAL_ERROR"), messages.genericError, false],
    ["forbidden origin", () => err(403, "FORBIDDEN_ORIGIN"), messages.genericError, false],
    ["unknown 429", () => err(429, "OTHER"), messages.genericError, false],
    ["garbage body", () => new Response("<html>", { status: 502 }), messages.genericError, false],
    ["network failure", offline, messages.offline, false],
    ["200 without a user", () => json(200, { nope: true }), messages.genericError, false],
  ])("maps %s to its message", async (_n, handler, text, cleared) => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = handler;
    submit("ana", "keep-me");
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText(messages.passwordLabel)).toHaveValue(cleared ? "" : "keep-me");
  });

  it("disables submit while pending and sends one request on same-tick double submit", async () => {
    await signedOut();
    const g = gate();
    routes["POST /api/auth/sign-in"] = () => g.promise;
    fireEvent.change(screen.getByLabelText(messages.usernameLabel), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText(messages.passwordLabel), { target: { value: "pw" } });
    const form = screen.getByRole("button", { name: messages.signInButton }).closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messages.signingIn })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    fireEvent.submit(form);
    await tick();
    expect(count("POST /api/auth/sign-in")).toBe(1);
    await g.release(json(200, { user: USER }));
    expect(await screen.findByText(messages.welcome("Ana"))).toBeInTheDocument();
  });

  it("allows a new attempt after a failure", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(429, "TOO_MANY_REQUESTS");
    submit();
    await screen.findByRole("alert");
    routes["POST /api/auth/sign-in"] = () => json(200, { user: USER });
    fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
    expect(await screen.findByText(messages.welcome("Ana"))).toBeInTheDocument();
  });

  it("survives an unmount while the request is pending", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    routes["GET /api/auth/me"] = NO_SESSION;
    const view = mount();
    await screen.findByLabelText(messages.usernameLabel);
    const g = gate();
    routes["POST /api/auth/sign-in"] = () => g.promise;
    submit();
    await waitFor(() => expect(count("POST /api/auth/sign-in")).toBe(1));
    view.unmount();
    await g.release(json(200, { user: USER }));
    await tick();
    expect(errors).not.toHaveBeenCalled();
  });

  it("never logs the credentials", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(401, "INVALID_CREDENTIALS");
    submit("ana", "hunter2-secret");
    await screen.findByRole("alert");
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain("hunter2-secret");
  });
});

describe("sign-out", () => {
  const expectClean = () => {
    const entries = client.getQueryCache().getAll();
    expect(entries.every((q) => q.queryKey[0] === "session" && q.state.data === null)).toBe(true);
    expect(client.getQueryData(["private"])).toBeUndefined();
  };
  const signOutWith = async (handler: Handler) => {
    await signedIn();
    client.setQueryData(["private"], { secret: 1 });
    routes["POST /api/auth/sign-out"] = handler;
    signOutClick();
    await expectSignIn();
  };

  it("returns to sign-in, clears cached data and shows no notice (AC6)", async () => {
    await signOutWith(() => json(204));
    expectClean();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts a 200 with a body as confirmed", async () => {
    await signOutWith(() => json(200, { ok: true }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["a network failure", offline],
    ["a server error", () => err(500, "INTERNAL_ERROR")],
  ])("clears the cache and warns that sign-out is unconfirmed after %s", async (_n, handler) => {
    await signOutWith(handler);
    expectClean();
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.signOutNotConfirmed);
  });

  it("clears the unconfirmed notice on the next sign-in attempt", async () => {
    await signOutWith(offline);
    await screen.findByRole("alert");
    const g = gate();
    routes["POST /api/auth/sign-in"] = () => g.promise;
    submit();
    await waitFor(() => expect(count("POST /api/auth/sign-in")).toBe(1));
    expect(screen.queryByText(messages.signOutNotConfirmed)).not.toBeInTheDocument();
    await g.release(err(401, "INVALID_CREDENTIALS"));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.wrongCredentials);
    expect(screen.queryByText(messages.signOutNotConfirmed)).not.toBeInTheDocument();
  });
});
