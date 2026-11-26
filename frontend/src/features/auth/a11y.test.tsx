import {
  QueryClientProvider,
  focusManager,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url"; // jsdom replaces the global URL, which fs rejects
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { messages } from "../../shared/messages";
import { SESSION_KEY, createQueryClient } from "../../shared/queryClient";

type Handler = () => Response | Promise<Response>;
let routes: Record<string, Handler>;
let client: QueryClient;
let container: HTMLElement;

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });
const err = (status: number, code: string) => json(status, { error: { code, message: "x" } });
const ME = () => json(200, { user: { id: "1", displayName: "Ana" } });
const NO_SESSION = () => err(401, "UNAUTHENTICATED");
const down = () => {
  throw new TypeError("offline");
};
const SLOW = { timeout: 3000 }; // /me retries once after 500 ms

function gate() {
  let release!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (release = r));
  return { promise, release: (r: Response) => act(async () => release(r)) };
}

// jsdom cannot compute layout or colour, so `color-contrast` is disabled: contrast is NOT
// checked here and needs a real browser.
// axe on a container skips page-level rules (`landmark-one-main`, `page-has-heading-one`), so the
// same helper also asserts exactly one `main` and one `h1` in the document, in every state.
const expectNoViolations = async () => {
  expect(document.querySelectorAll("main")).toHaveLength(1);
  expect(document.querySelectorAll("h1")).toHaveLength(1);
  const { violations } = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
};

beforeEach(() => {
  routes = {};
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${path}`];
    if (!handler) return Promise.reject(new Error("unrouted"));
    return handler();
  });
  client = createQueryClient();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true); // the `offline` events below flip this global
});

const mount = (strict = false) => {
  const tree = (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  ({ container } = view);
  return view;
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
const submit = () => {
  fireEvent.change(screen.getByLabelText(messages.usernameLabel), { target: { value: "ana" } });
  fireEvent.change(screen.getByLabelText(messages.passwordLabel), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
};
const h1 = (name: string) => screen.getByRole("heading", { level: 1, name });
const failRefetch = (handler: Handler = down) => {
  routes["GET /api/auth/me"] = handler;
  return act(() => client.refetchQueries({ queryKey: SESSION_KEY }));
};
const setOnLine = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);

describe("axe: zero violations in every state", () => {
  it("loading", async () => {
    const g = gate();
    routes["GET /api/auth/me"] = () => g.promise;
    mount();
    await screen.findByRole("status");
    await expectNoViolations();
    await g.release(NO_SESSION());
  });

  it("signed-out sign-in form", async () => {
    await signedOut();
    await expectNoViolations();
  });

  it("sign-in with wrongCredentials shown", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(401, "INVALID_CREDENTIALS");
    submit();
    expect(await screen.findByText(messages.wrongCredentials)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("sign-in with the sign-out-not-confirmed notice", async () => {
    await signedIn();
    routes["POST /api/auth/sign-out"] = down;
    fireEvent.click(screen.getByRole("button", { name: messages.signOutButton }));
    expect(await screen.findByText(messages.signOutNotConfirmed)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("first-load offline error with Retry", async () => {
    routes["GET /api/auth/me"] = down;
    mount();
    expect(await screen.findByText(messages.offline, undefined, SLOW)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("signed-in Home", async () => {
    await signedIn();
    await expectNoViolations();
  });

  it("negative control: an image without alt is reported", async () => {
    ({ container } = render(<img src="x.png" />));
    const { violations } = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(violations.map((v) => v.id)).toContain("image-alt");
  });

  it("sign-in offline: banner and offline alert together", async () => {
    await signedOut();
    setOnLine(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    routes["POST /api/auth/sign-in"] = down;
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.offline);
    expect(screen.getByText(messages.offlineBanner)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("sign-in while the request is pending", async () => {
    await signedOut();
    const g = gate();
    routes["POST /api/auth/sign-in"] = () => g.promise;
    submit();
    await screen.findByRole("button", { name: messages.signingIn });
    await expectNoViolations();
    await g.release(ME());
  });

  it("sign-in with a non-password error", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(429, "LOCKED");
    submit();
    expect(await screen.findByText(messages.locked)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("sign-in with validationRequired", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(400, "VALIDATION");
    fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
    expect(await screen.findByText(messages.validationRequired)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("sign-in after a failed signed-out background refetch (banner)", async () => {
    await signedOut();
    await failRefetch();
    expect(await screen.findByText(messages.offlineBanner, undefined, SLOW)).toBeInTheDocument();
    await expectNoViolations();
  });

  it("Home with the back-online notice", async () => {
    await signedIn();
    setOnLine(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    setOnLine(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("status")).toHaveTextContent(messages.backOnline);
    await expectNoViolations();
  });

  it("Home while sign-out is pending", async () => {
    await signedIn();
    const g = gate();
    routes["POST /api/auth/sign-out"] = () => g.promise;
    fireEvent.click(screen.getByRole("button", { name: messages.signOutButton }));
    await screen.findByRole("button", { name: messages.signingOut });
    await expectNoViolations();
    await g.release(json(204));
  });

  it("Home while a background refetch failed (banner)", async () => {
    await signedIn();
    routes["GET /api/auth/me"] = down;
    await act(() => client.refetchQueries({ queryKey: SESSION_KEY }));
    expect(await screen.findByText(messages.offlineBanner, undefined, SLOW)).toBeInTheDocument();
    await expectNoViolations();
  });
});

describe("focus and semantics", () => {
  it("each screen is a main landmark with a visible h1", async () => {
    await signedOut();
    expect(screen.getByRole("main")).toContainElement(h1(messages.signInTitle));
  });

  it("Home and the first-load error are main landmarks with an h1", async () => {
    await signedIn();
    expect(screen.getByRole("main")).toContainElement(h1(messages.welcome("Ana")));
    cleanup();
    client = createQueryClient();
    routes["GET /api/auth/me"] = down;
    mount();
    await screen.findByText(messages.offline, undefined, SLOW);
    expect(screen.getByRole("main")).toContainElement(h1(messages.appName));
  });

  it("focuses the sign-in h1 after sign-out and the Home h1 after sign-in (StrictMode)", async () => {
    await signedIn(true);
    expect(document.activeElement).toBe(h1(messages.welcome("Ana")));
    routes["POST /api/auth/sign-out"] = () => json(204);
    fireEvent.click(screen.getByRole("button", { name: messages.signOutButton }));
    await screen.findByLabelText(messages.usernameLabel);
    expect(document.activeElement).toBe(h1(messages.signInTitle));
    routes["POST /api/auth/sign-in"] = () => ME();
    submit();
    await screen.findByText(messages.welcome("Ana"));
    expect(document.activeElement).toBe(h1(messages.welcome("Ana")));
  });

  it("wrong password focuses the password input and links both inputs to the alert", async () => {
    await signedOut();
    const user = screen.getByLabelText(messages.usernameLabel);
    const pass = screen.getByLabelText(messages.passwordLabel);
    expect(pass).not.toHaveAttribute("aria-describedby");
    expect(pass).not.toHaveAttribute("aria-invalid");
    routes["POST /api/auth/sign-in"] = () => err(401, "INVALID_CREDENTIALS");
    submit();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(pass));
    for (const input of [user, pass]) {
      expect(input).toHaveAttribute("aria-describedby", alert.id);
      expect(input).toHaveAttribute("aria-invalid", "true");
    }
    // The error goes away on the next attempt: the attributes must go with it.
    const g = gate();
    routes["POST /api/auth/sign-in"] = () => g.promise;
    fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
    await waitFor(() => expect(pass).not.toHaveAttribute("aria-describedby"));
    for (const input of [user, pass]) {
      expect(input).not.toHaveAttribute("aria-describedby");
      expect(input).not.toHaveAttribute("aria-invalid");
    }
    await g.release(ME());
  });

  it("two consecutive wrong passwords refocus the password input each time", async () => {
    await signedOut();
    const pass = screen.getByLabelText(messages.passwordLabel);
    routes["POST /api/auth/sign-in"] = () => err(401, "INVALID_CREDENTIALS");
    for (let attempt = 0; attempt < 2; attempt++) {
      submit();
      await screen.findByRole("alert");
      await waitFor(() => expect(document.activeElement).toBe(pass));
      (document.activeElement as HTMLElement).blur(); // the user moved away
      expect(document.activeElement).not.toBe(pass);
    }
  });

  it("a non-password error focuses the alert and does not mark the inputs invalid", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = () => err(429, "TOO_MANY_REQUESTS");
    submit();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    for (const label of [messages.usernameLabel, messages.passwordLabel]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("aria-describedby", alert.id);
      expect(input).not.toHaveAttribute("aria-invalid");
    }
  });

  describe("validationRequired", () => {
    const run = async (username: string, password: string) => {
      await signedOut();
      routes["POST /api/auth/sign-in"] = () => err(400, "VALIDATION");
      const user = screen.getByLabelText(messages.usernameLabel);
      const pass = screen.getByLabelText(messages.passwordLabel);
      fireEvent.change(user, { target: { value: username } });
      fireEvent.change(pass, { target: { value: password } });
      fireEvent.click(screen.getByRole("button", { name: messages.signInButton }));
      const alert = await screen.findByRole("alert");
      return { user, pass, alert };
    };

    it("both empty: focuses the username and marks both fields", async () => {
      const { user, pass, alert } = await run("", "");
      await waitFor(() => expect(document.activeElement).toBe(user));
      for (const input of [user, pass]) {
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAttribute("aria-describedby", alert.id);
      }
    });

    it("only the password empty: focuses it and leaves the username unmarked", async () => {
      const { user, pass, alert } = await run("ana", "");
      await waitFor(() => expect(document.activeElement).toBe(pass));
      expect(pass).toHaveAttribute("aria-invalid", "true");
      expect(pass).toHaveAttribute("aria-describedby", alert.id);
      expect(user).not.toHaveAttribute("aria-invalid");
      expect(user).not.toHaveAttribute("aria-describedby");
    });

    it("only the username empty: focuses it and leaves the password unmarked", async () => {
      const { user, pass } = await run("  ", "pw");
      await waitFor(() => expect(document.activeElement).toBe(user));
      expect(user).toHaveAttribute("aria-invalid", "true");
      expect(pass).not.toHaveAttribute("aria-invalid");
      expect(pass).not.toHaveAttribute("aria-describedby");
    });

    it("no empty field: falls back to focusing the alert", async () => {
      const { alert } = await run("ana", "pw");
      await waitFor(() => expect(document.activeElement).toBe(alert));
    });
  });

  it("a pending submit is aria-busy, keeps focus, says so and sends one request", async () => {
    await signedOut();
    const g = gate();
    let posts = 0;
    routes["POST /api/auth/sign-in"] = () => (posts++, g.promise);
    const button = screen.getByRole("button", { name: messages.signInButton });
    button.focus();
    submit();
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveTextContent(messages.signingIn);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(posts).toBe(1);
    await g.release(ME());
  });

  it("Enter-key implicit submit (form submit events) sends one request", async () => {
    await signedOut();
    const g = gate();
    let posts = 0;
    routes["POST /api/auth/sign-in"] = () => (posts++, g.promise);
    const pass = screen.getByLabelText(messages.passwordLabel);
    fireEvent.change(screen.getByLabelText(messages.usernameLabel), { target: { value: "ana" } });
    fireEvent.change(pass, { target: { value: "pw" } });
    // aria-disabled (unlike `disabled`) does not block implicit submission, so the guard must.
    const form = pass.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByRole("button", { name: messages.signingIn });
    fireEvent.submit(form);
    expect(posts).toBe(1);
    await g.release(ME());
  });

  it("Home: a double click while sign-out is pending sends one request", async () => {
    await signedIn();
    const g = gate();
    let posts = 0;
    routes["POST /api/auth/sign-out"] = () => (posts++, g.promise);
    const button = screen.getByRole("button", { name: messages.signOutButton });
    fireEvent.click(button);
    fireEvent.click(button);
    const pending = await screen.findByRole("button", { name: messages.signingOut });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(pending);
    expect(posts).toBe(1);
    await g.release(json(204));
  });

  describe("first-load error screen", () => {
    it("takes focus on its h1 when it appears", async () => {
      routes["GET /api/auth/me"] = down;
      mount(true);
      await screen.findByText(messages.offline, undefined, SLOW);
      expect(document.activeElement).toBe(h1(messages.appName));
    });

    it("Retry swaps to the loading screen, focuses its h1 and refetches once", async () => {
      routes["GET /api/auth/me"] = down;
      mount();
      await screen.findByText(messages.offline, undefined, SLOW);
      const g = gate();
      let calls = 0;
      routes["GET /api/auth/me"] = () => (calls++, g.promise);
      const retry = screen.getByRole("button", { name: messages.retryButton });
      retry.focus();
      fireEvent.click(retry);
      expect(await screen.findByRole("status")).toHaveTextContent(messages.loading);
      expect(screen.queryByRole("button", { name: messages.retryButton })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(h1(messages.appName));
      expect(calls).toBe(1);
      await g.release(ME());
      await screen.findByText(messages.welcome("Ana"));
      expect(document.activeElement).toBe(h1(messages.welcome("Ana")));
    });

    it("Retry that fails again returns focus to the error h1", async () => {
      routes["GET /api/auth/me"] = down;
      mount();
      await screen.findByText(messages.offline, undefined, SLOW);
      fireEvent.click(screen.getByRole("button", { name: messages.retryButton }));
      await screen.findByText(messages.offline, undefined, SLOW);
      expect(document.activeElement).toBe(h1(messages.appName));
    });

    it("the loading screen of a fast cold start does not take focus", async () => {
      const g = gate();
      routes["GET /api/auth/me"] = () => g.promise;
      mount(true);
      expect(await screen.findByRole("status")).toHaveTextContent(messages.loading);
      expect(document.activeElement).toBe(document.body);
      await g.release(NO_SESSION());
    });
  });
});

describe("offline", () => {
  const goOffline = () => {
    setOnLine(false);
    act(() => void window.dispatchEvent(new Event("offline")));
  };
  const goOnline = () => {
    setOnLine(true);
    act(() => void window.dispatchEvent(new Event("online")));
  };
  const banner = () => screen.getByRole("status");

  it("first-load fetch rejection shows the offline message", async () => {
    routes["GET /api/auth/me"] = down;
    mount();
    expect(await screen.findByText(messages.offline, undefined, SLOW)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(messages.offline);
  });

  it("cold start while the browser reports offline shows the offline message, not loading", async () => {
    setOnLine(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    routes["GET /api/auth/me"] = down;
    mount();
    expect(await screen.findByText(messages.offline, undefined, SLOW)).toBeInTheDocument();
  });

  it("sign-out while the browser reports offline still ends the local session", async () => {
    await signedIn();
    goOffline();
    routes["POST /api/auth/sign-out"] = down;
    fireEvent.click(screen.getByRole("button", { name: messages.signOutButton }));
    expect(await screen.findByText(messages.signOutNotConfirmed)).toBeInTheDocument();
  });

  it("sign-in with a rejecting fetch shows the offline message in an alert", async () => {
    await signedOut();
    routes["POST /api/auth/sign-in"] = down;
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.offline);
  });

  it("the banner is a persistent live region placed after the h1, empty when online", async () => {
    for (const screenReady of [signedIn, signedOut]) {
      setOnLine(true);
      await screenReady();
      const live = banner();
      expect(live).toBeEmptyDOMElement();
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      goOffline();
      expect(banner()).toBe(live); // same node: text changes, so assistive tech announces it
      expect(live).toHaveTextContent(messages.offlineBanner);
      goOnline();
      expect(banner()).toBe(live);
      expect(live).toHaveTextContent(messages.backOnline);
      cleanup();
      client = createQueryClient();
    }
  });

  it("back-online lasts until the next state change", async () => {
    await signedIn();
    goOffline();
    goOnline();
    expect(banner()).toHaveTextContent(messages.backOnline);
    goOffline();
    expect(banner()).toHaveTextContent(messages.offlineBanner);
    goOnline();
    expect(banner()).toHaveTextContent(messages.backOnline);
  });

  it("back-online is cleared by the next navigation of the screen", async () => {
    await signedOut();
    goOffline();
    goOnline();
    expect(banner()).toHaveTextContent(messages.backOnline);
    routes["POST /api/auth/sign-in"] = () => ME();
    submit();
    await screen.findByText(messages.welcome("Ana"));
    expect(banner()).toBeEmptyDOMElement();
  });

  it("stops listening to online/offline after unmount", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const onLine = setOnLine(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await signedIn();
    cleanup();
    for (const type of ["online", "offline"]) {
      const added = add.mock.calls.filter((c) => c[0] === type).map((c) => c[1]);
      const removed = remove.mock.calls.filter((c) => c[0] === type).map((c) => c[1]);
      expect(added.length).toBeGreaterThan(0);
      for (const fn of added) expect(removed).toContain(fn);
    }
    // Behaviour: a late event neither re-reads the snapshot nor warns about an update.
    onLine.mockClear();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(onLine).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("a failed background refetch (NetworkError) shows the banner; recovery announces it", async () => {
    await signedIn();
    await failRefetch();
    expect(await screen.findByText(messages.offlineBanner, undefined, SLOW)).toBeInTheDocument();
    await failRefetch(ME);
    await waitFor(() => expect(banner()).toHaveTextContent(messages.backOnline));
  });

  it("a signed-out background refetch failure shows the banner too", async () => {
    await signedOut();
    await failRefetch();
    expect(await screen.findByText(messages.offlineBanner, undefined, SLOW)).toBeInTheDocument();
  });

  it("a 500 on a background refetch does not show the offline banner", async () => {
    await signedIn();
    await failRefetch(() => json(500, { error: { code: "X", message: "x" } }));
    await waitFor(() => expect(client.getQueryState(SESSION_KEY)?.status).toBe("error"));
    expect(banner()).toBeEmptyDOMElement();
  });
});

// Coarse source check on the stylesheet (not computed styles): comments are stripped and only
// top-level rules are matched, so a commented-out or nested declaration cannot satisfy it.
describe("stylesheet", () => {
  const source = readFileSync(new NodeURL("../../index.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.trim().replace(/\s+/g, " "),
    body: body!,
  }));
  const body = (selector: string) =>
    rules
      .filter((r) => r.selector === selector)
      .map((r) => r.body)
      .join(";");

  it("has a visible outline on :focus-visible for inputs and buttons", () => {
    expect(body("input:focus-visible, button:focus-visible")).toMatch(
      /outline:\s*[1-9]\d*px\s+solid\s+#[0-9a-f]{3,8}\b/i,
    );
  });
  it("sets min-height 44px on inputs and buttons", () => {
    expect(body("input, button")).toMatch(/min-height:\s*44px/);
  });
  it("styles a pending button with a muted colour and a progress cursor", () => {
    const rule = body('button[aria-disabled="true"]');
    expect(rule).toMatch(/color:\s*#4b5563/i); // 6.10:1 on the #e5e7eb background below
    expect(rule).toMatch(/background(-color)?:\s*#e5e7eb/i);
    expect(rule).toMatch(/cursor:\s*progress/);
  });
  it("wraps long headings and sizes inputs to their container", () => {
    expect(body("h1")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body("input")).toMatch(/width:\s*100%/);
    expect(body("input")).toMatch(/box-sizing:\s*border-box/);
  });
});
