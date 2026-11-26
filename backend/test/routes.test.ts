import { inspect } from "node:util";
import request, { type Response } from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Collection, ObjectId, type Db } from "mongodb";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/errors.js";
import { ensureIndexes } from "../src/indexes.js";
import { createStaffModel } from "../src/models/staff.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../src/services/hash.js";
import { createLockout } from "../src/services/lockout.js";
import { normalizePassword } from "../src/services/password-input.js";
import { createSessions } from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

// Real hashing everywhere, but verifyPassword is a spy so tests can count calls and hold them open.
vi.mock("../src/services/hash.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/hash.js")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});
const actualVerify = (
  await vi.importActual<typeof import("../src/services/hash.js")>("../src/services/hash.js")
).verifyPassword;
const verifySpy = vi.mocked(verifyPassword);

const T0 = new Date("2026-03-01T12:00:00Z");
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ORIGIN = "https://app.example";
const PASSWORD = "correct horse battery";
const SECRET = "SECRET-LEAK-MARKER $argon2id$v=19";
const SESSION_RE =
  /^__session=([A-Za-z0-9_-]{43}); HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=1209600$/;
const CLEARED = "__session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

let db: Db;
let stop: () => Promise<void>;
let current: Date;
let nowCalls: number;
let app: Express;
let mariaId: string;
let mariaHash: string;
let nfcHash: string;

const sessions = () => createSessions(db);
const at = (ms: number) => new Date(T0.getTime() + ms);
const setCookies = (res: Response): string[] =>
  (res.headers["set-cookie"] as unknown as string[]) ?? [];
const idFrom = (res: Response) => SESSION_RE.exec(setCookies(res)[0] ?? "")?.[1];
const newSession = async (when = T0) => (await sessions().create(mariaId, when)).id;
const me = (cookie?: string) => {
  const r = request(app).get("/api/auth/me");
  return cookie === undefined ? r : r.set("Cookie", cookie);
};
const signIn = (username: unknown, password: unknown, a: Express = app) =>
  request(a).post("/api/auth/sign-in").send({ username, password });

function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe("string");
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}): Express {
  return createApp({
    db,
    now: () => {
      nowCalls++;
      return current;
    },
    allowedOrigins: [ORIGIN],
    mountProtected: (router) => {
      router.get("/secret", (_req, res) => {
        res.json({ secret: true });
      });
      router.get("/boom", () => {
        throw new Error(SECRET);
      });
      router.get("/unavailable", () => {
        throw Object.assign(new Error(SECRET), { status: 503 });
      });
      router.get("/boom-async", async () => {
        await Promise.resolve();
        throw new Error(SECRET);
      });
    },
    ...overrides,
  });
}

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureIndexes(db);
  mariaHash = await hashPassword(normalizePassword(PASSWORD)!);
  nfcHash = await hashPassword(normalizePassword("paéss-wörd-long")!);
});
afterAll(async () => {
  await stop();
});
beforeEach(async () => {
  for (const name of ["staff", "sessions", "signInAttempts"]) {
    await db.collection(name).deleteMany({});
  }
  mariaId = (
    await createStaffModel(db).createStaff(
      { username: "maria", displayName: "Maria Gomez", passwordHash: mariaHash },
      T0,
    )
  ).id;
  current = T0;
  nowCalls = 0;
  verifySpy.mockClear();
  app = makeApp();
});
afterEach(() => {
  vi.restoreAllMocks();
  verifySpy.mockImplementation(actualVerify);
});

describe("health", () => {
  it("is public and answers ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("sign-in (AC1)", () => {
  it("returns the member's name and sets the exact session cookie", async () => {
    const res = await signIn("maria", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: mariaId, displayName: "Maria Gomez" } });
    expect(setCookies(res)).toHaveLength(1);
    expect(setCookies(res)[0]).toMatch(SESSION_RE);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(await db.collection("sessions").countDocuments()).toBe(1);
    // the cookie it handed out works
    const id = idFrom(res)!;
    const who = await me(`__session=${id}`);
    expect(who.status).toBe(200);
    expect(who.body).toEqual({ user: { id: mariaId, displayName: "Maria Gomez" } });
  });

  it("trims and case-folds the username", async () => {
    const res = await signIn("  MARIA ", PASSWORD);
    expect(res.status).toBe(200);
  });

  it("signs in with a canonically equivalent password (NFC set, NFD typed)", async () => {
    await createStaffModel(db).createStaff(
      { username: "ines", displayName: "Ines", passwordHash: nfcHash },
      T0,
    );
    const res = await signIn("ines", "paéss-wörd-long");
    expect(res.status).toBe(200);
    expect(verifySpy.mock.calls[0]?.[0]).toBe("paéss-wörd-long");
  });

  it("refuses an empty password with 400 before verifying anything", async () => {
    expectError(await signIn("maria", ""), 400, "VALIDATION_ERROR");
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("refuses a username with a lone surrogate with 400", async () => {
    expectError(await signIn("mar\ud800ia", "x"), 400, "VALIDATION_ERROR");
  });

  it("clears the failure count on success", async () => {
    for (let i = 0; i < 4; i++) await signIn("maria", "wrong");
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
    for (let i = 0; i < 4; i++) await signIn("maria", "wrong");
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });
});

describe("wrong password and unknown user (AC2, AC3)", () => {
  it("AC2: a wrong password gets the generic 401 and no cookie", async () => {
    const wrong = await signIn("maria", "not the password");
    expectError(wrong, 401, "INVALID_CREDENTIALS");
    expect(setCookies(wrong)).toHaveLength(0);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(verifySpy.mock.calls[0]?.[1]).toBe(mariaHash);
    expect(wrong.headers["cache-control"]).toBe("no-store");
    expect(await db.collection("sessions").countDocuments()).toBe(0);
  });

  it("AC3: an unknown username gets the same status, message and body shape, and pays one dummy verification", async () => {
    const unknown = await signIn("ghost", "not the password");
    const wrong = await signIn("maria", "not the password");
    expectError(unknown, 401, "INVALID_CREDENTIALS");
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body).toEqual(wrong.body);
    expect(Object.keys(unknown.body.error)).toEqual(Object.keys(wrong.body.error));
    expect(setCookies(unknown)).toHaveLength(0);
    expect(verifySpy).toHaveBeenCalledTimes(2);
    expect(verifySpy.mock.calls[0]?.[1]).toBe(DUMMY_HASH);
    expect(await db.collection("sessions").countDocuments()).toBe(0);
  });

  it("counts an unknown name's attempt too", async () => {
    await signIn("ghost", "x");
    expect(await db.collection("signInAttempts").countDocuments({ _id: "ghost" as never })).toBe(1);
  });

  it("counts each failed attempt exactly once", async () => {
    await signIn("maria", "wrong");
    const doc = await db.collection("signInAttempts").findOne({ _id: "maria" as never });
    expect(doc?.count).toBe(1);
  });
});

describe("input validation", () => {
  const long = "a".repeat(65);
  const bad: [string, unknown][] = [
    ["no body", undefined],
    ["array body", []],
    ["empty object", {}],
    ["missing password", { username: "maria" }],
    ["missing username", { password: "x" }],
    ["numeric username", { username: 5, password: "x" }],
    ["array username", { username: ["maria"], password: "x" }],
    ["operator username", { username: { $ne: null }, password: "x" }],
    ["operator password", { username: "maria", password: { $ne: null } }],
    ["numeric password", { username: "maria", password: 5 }],
    ["empty username", { username: "", password: "x" }],
    ["blank username", { username: "   ", password: "x" }],
    ["65 char username", { username: long, password: "x" }],
    ["1025 char password", { username: "maria", password: "a".repeat(1025) }],
    ["lone surrogate password", { username: "maria", password: "ab\ud800" }],
    ["empty password", { username: "maria", password: "" }],
    ["lone surrogate username", { username: "ab\udc00", password: "x" }],
  ];

  it.each(bad)("rejects %s with 400 before touching the database", async (_name, body) => {
    const findOne = vi.spyOn(Collection.prototype, "findOne");
    const res = await request(app)
      .post("/api/auth/sign-in")
      .send(body as never);
    expectError(res, 400, "VALIDATION_ERROR");
    expect(findOne).not.toHaveBeenCalled();
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("never echoes the input", async () => {
    const res = await signIn("ECHO-MARKER", "a".repeat(1025));
    expectError(res, 400, "VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/ECHO-MARKER|aaaa/);
  });

  it("accepts the boundaries: 64 character username and 1024 character password", async () => {
    expectError(await signIn("a".repeat(64), "a".repeat(1024)), 401, "INVALID_CREDENTIALS");
  });

  it("answers 400 to a non-JSON content type instead of crashing", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
      const res = await request(app)
        .post("/api/auth/sign-in")
        .set("Content-Type", type)
        .send("username=maria&password=x");
      expectError(res, 400, "VALIDATION_ERROR");
    }
  });
});

describe("generic error handling", () => {
  it("answers malformed JSON with 400 in the error shape", async () => {
    const res = await request(app)
      .post("/api/auth/sign-in")
      .set("Content-Type", "application/json")
      .send('{"username":');
    expectError(res, 400, "VALIDATION_ERROR");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers a body over 10 kB with 413 and accepts one just under", async () => {
    const over = JSON.stringify({ username: "maria", password: "a".repeat(10_300) });
    const under = JSON.stringify({ username: "maria", password: "a".repeat(10_000) });
    const json = (body: string) =>
      request(app).post("/api/auth/sign-in").set("Content-Type", "application/json").send(body);
    expectError(await json(over), 413, "PAYLOAD_TOO_LARGE");
    // under the limit it reaches validation (password over 1024 chars)
    expectError(await json(under), 400, "VALIDATION_ERROR");
  });

  it("answers unknown routes with 404 in the error shape", async () => {
    expectError(await request(app).get("/nope"), 404, "NOT_FOUND");
    expectError(await request(app).post("/nope").send({}), 404, "NOT_FOUND");
    const id = await newSession();
    const res = await request(app).get("/api/nope").set("Cookie", `__session=${id}`);
    expectError(res, 404, "NOT_FOUND");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers a thrown fault with a generic 500 that leaks nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await newSession();
    for (const path of ["/api/boom", "/api/boom-async"]) {
      const res = await request(app).get(path).set("Cookie", `__session=${id}`);
      expectError(res, 500, "INTERNAL_ERROR");
      expect(res.text).not.toMatch(/SECRET|argon2|Error|at /);
    }
    expect(inspect(log.mock.calls, { depth: 6 })).not.toMatch(/SECRET|argon2/);
  });

  it("answers a failing database with a generic 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new Proxy({}, { get: () => () => Promise.reject(new Error(SECRET)) });
    const brokenApp = makeApp({ db: { collection: () => broken } as never });
    const res = await signIn("maria", PASSWORD, brokenApp);
    expectError(res, 500, "INTERNAL_ERROR");
    expect(res.text).not.toMatch(/SECRET|argon2/);
    expect(inspect(log.mock.calls, { depth: 6 })).not.toMatch(/SECRET|argon2/);
  });

  it("sends Cache-Control: no-store on every kind of response", async () => {
    const id = await newSession();
    const responses = [
      await request(app).get("/api/health"),
      await me(`__session=${id}`),
      await me(),
      await request(app).post("/api/auth/sign-out"),
      await request(app).get("/nope"),
    ];
    for (const res of responses) expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("requireStaff (AC4)", () => {
  it("refuses an unauthenticated call to a protected route and to /me", async () => {
    expectError(await request(app).get("/api/secret"), 401, "UNAUTHENTICATED");
    expectError(await me(), 401, "UNAUTHENTICATED");
    const id = await newSession();
    const ok = await request(app).get("/api/secret").set("Cookie", `__session=${id}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ secret: true });
  });

  it("refuses an unknown but well-formed session id and clears the cookie", async () => {
    const res = await me(`__session=${"A".repeat(43)}`);
    expectError(res, 401, "UNAUTHENTICATED");
    expect(setCookies(res)).toEqual([CLEARED]);
  });

  it("refuses when the account is gone while the session is live", async () => {
    const id = await newSession();
    await db.collection("staff").deleteMany({});
    const res = await me(`__session=${id}`);
    expectError(res, 401, "UNAUTHENTICATED");
    expect(setCookies(res)).toEqual([CLEARED]);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("refuses a session whose staff id is not a valid object id", async () => {
    const id = (await sessions().create("not-an-object-id", T0)).id;
    expectError(await me(`__session=${id}`), 401, "UNAUTHENTICATED");
    const other = (await sessions().create(new ObjectId().toHexString(), T0)).id;
    expectError(await me(`__session=${other}`), 401, "UNAUTHENTICATED");
  });

  it("takes the session id only from the __session cookie and never queries with junk", async () => {
    const id = await newSession();
    const spies = (["findOne", "findOneAndUpdate", "deleteOne"] as const).map((m) =>
      vi.spyOn(Collection.prototype, m),
    );
    const junk = [
      `session=${id}`,
      `__session2=${id}`,
      `x__session=${id}`,
      "__session=short",
      `__session=${id}x`,
      `__session=${"a".repeat(44)}`,
      `__session=${"a".repeat(42)}`,
      "__session=",
      "__session",
      '__session={"$ne":null}',
      "__session[$ne]=1",
      `__session=${id.slice(0, 42)}!`,
      "garbage",
    ];
    for (const cookie of junk) {
      expectError(await me(cookie), 401, "UNAUTHENTICATED");
      expect((await request(app).post("/api/auth/sign-out").set("Cookie", cookie)).status).toBe(
        204,
      );
    }
    const bearer = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${id}`);
    expectError(bearer, 401, "UNAUTHENTICATED");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    // the real cookie still works after unrelated cookies around it
    expect((await me(`a=b; __session=${id}; c=d`)).status).toBe(200);
  });
});

describe("session lifetime and cookie refresh (AC5, AC8)", () => {
  it("is valid at day 13 and on the inclusive day-14 boundary", async () => {
    const a = await newSession();
    const b = await newSession();
    current = at(13 * DAY);
    expect((await me(`__session=${a}`)).status).toBe(200);
    current = at(14 * DAY);
    expect((await me(`__session=${b}`)).status).toBe(200);
  });

  it("is refused 1 ms after day 14 and at day 15 with the record still in the database", async () => {
    const a = await newSession();
    const b = await newSession();
    current = at(14 * DAY + 1);
    expectError(await me(`__session=${a}`), 401, "UNAUTHENTICATED");
    current = at(15 * DAY);
    const res = await me(`__session=${b}`);
    expectError(res, 401, "UNAUTHENTICATED");
    expect(setCookies(res)).toEqual([CLEARED]);
    expect(await db.collection("sessions").countDocuments()).toBe(2);
  });

  it("slides: use at day 13 keeps the session alive at day 26", async () => {
    const id = await newSession();
    current = at(13 * DAY);
    expect((await me(`__session=${id}`)).status).toBe(200);
    current = at(26 * DAY);
    expect((await me(`__session=${id}`)).status).toBe(200);
  });

  it("re-sends the cookie only when the session was touched", async () => {
    const id = await newSession();
    current = at(30 * MIN);
    const untouched = await me(`__session=${id}`);
    expect(untouched.status).toBe(200);
    expect(setCookies(untouched)).toHaveLength(0);

    current = at(HOUR);
    const touched = await me(`__session=${id}`);
    expect(touched.status).toBe(200);
    expect(setCookies(touched)).toEqual([
      `__session=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600`,
    ]);

    const again = await me(`__session=${id}`);
    expect(setCookies(again)).toHaveLength(0);
  });

  it("refreshes the cookie on protected routes as well", async () => {
    const id = await newSession();
    current = at(2 * HOUR);
    const res = await request(app).get("/api/secret").set("Cookie", `__session=${id}`);
    expect(setCookies(res)[0]).toMatch(SESSION_RE);
  });
});

describe("sign-out (AC6)", () => {
  it("ends this device's session, clears the cookie and leaves another device alone", async () => {
    const phone = await newSession();
    const laptop = await newSession();
    const out = await request(app).post("/api/auth/sign-out").set("Cookie", `__session=${phone}`);
    expect(out.status).toBe(204);
    expect(out.text).toBe("");
    expect(setCookies(out)).toEqual([CLEARED]);
    expect(out.headers["cache-control"]).toBe("no-store");
    expectError(await me(`__session=${phone}`), 401, "UNAUTHENTICATED");
    expect((await me(`__session=${laptop}`)).status).toBe(200);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("is idempotent and works without a cookie", async () => {
    const first = await request(app).post("/api/auth/sign-out");
    expect(first.status).toBe(204);
    expect(setCookies(first)).toEqual([CLEARED]);
    const id = await newSession();
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post("/api/auth/sign-out").set("Cookie", `__session=${id}`);
      expect(res.status).toBe(204);
    }
  });
});

describe("lockout (AC7)", () => {
  it("refuses the sixth attempt even with the correct password, until the window passes", async () => {
    for (let i = 0; i < 5; i++) {
      expectError(await signIn("maria", "wrong"), 401, "INVALID_CREDENTIALS");
    }
    expect(verifySpy).toHaveBeenCalledTimes(5);
    const locked = await signIn("maria", PASSWORD);
    expectError(locked, 429, "LOCKED");
    expect(locked.body.error.message).toMatch(/try again later/i);
    expect(setCookies(locked)).toHaveLength(0);
    expect(locked.headers["cache-control"]).toBe("no-store");
    expect(verifySpy).toHaveBeenCalledTimes(5);
    expect(await db.collection("sessions").countDocuments()).toBe(0);

    current = at(15 * MIN - 1);
    expectError(await signIn("maria", PASSWORD), 429, "LOCKED");
    current = at(15 * MIN);
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });

  it("locks unknown usernames identically, whatever the spelling", async () => {
    for (let i = 0; i < 5; i++) {
      await signIn(i % 2 ? "GHOST " : "ghost", "wrong");
    }
    const locked = await signIn("ghost", "anything");
    expectError(locked, 429, "LOCKED");
    expectError(await signIn(" Ghost", "anything"), 429, "LOCKED");
    current = at(15 * MIN);
    expectError(await signIn("ghost", "anything"), 401, "INVALID_CREDENTIALS");
  });

  it("does not lock other usernames", async () => {
    for (let i = 0; i < 5; i++) await signIn("ghost", "wrong");
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });
});

describe("clock (one reading per request)", () => {
  it("reads the injected clock exactly once per request", async () => {
    nowCalls = 0;
    await signIn("maria", PASSWORD);
    expect(nowCalls).toBe(1);
    nowCalls = 0;
    await signIn("ghost", "wrong");
    expect(nowCalls).toBe(1);
    const id = await newSession();
    nowCalls = 0;
    await me(`__session=${id}`);
    expect(nowCalls).toBe(1);
    nowCalls = 0;
    await request(app).get("/api/health");
    expect(nowCalls).toBe(1);
  });

  it("hands the same Date to the lockout and the session on sign-in", async () => {
    let n = 0;
    const base = T0.getTime();
    const ticking = makeApp({ now: () => new Date(base + 1000 * n++) });
    const updates = vi.spyOn(Collection.prototype, "findOneAndUpdate");
    const inserts = vi.spyOn(Collection.prototype, "insertOne");
    const res = await signIn("maria", PASSWORD, ticking);
    expect(res.status).toBe(200);
    expect(n).toBe(1);
    const pipelines = updates.mock.calls.map((c) => JSON.stringify(c[1]));
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0]).toContain(T0.toISOString());
    expect(inserts.mock.calls).toHaveLength(1);
    expect((inserts.mock.calls[0]?.[0] as { createdAt: Date }).createdAt).toEqual(T0);
  });

  it("hands the same Date to the session lookup on /me", async () => {
    const id = await newSession();
    let n = 0;
    const base = T0.getTime() + 2 * HOUR;
    const ticking = makeApp({ now: () => new Date(base + 1000 * n++) });
    const updates = vi.spyOn(Collection.prototype, "findOneAndUpdate");
    const res = await request(ticking).get("/api/auth/me").set("Cookie", `__session=${id}`);
    expect(res.status).toBe(200);
    expect(n).toBe(1);
    const call = updates.mock.calls[0];
    const first = new Date(base).toISOString();
    expect(JSON.stringify(call?.[1])).toContain(first);
    expect(JSON.stringify(call?.[0])).toContain(new Date(base - 14 * DAY).toISOString());
  });
});

describe("origin check", () => {
  it("refuses a foreign Origin on every state-changing method with 403", async () => {
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const res = await request(app)[method]("/api/health").set("Origin", "https://evil.example");
      expectError(res, 403, "FORBIDDEN_ORIGIN");
    }
    expectError(
      await request(app).post("/api/auth/sign-in").set("Origin", "null").send({}),
      403,
      "FORBIDDEN_ORIGIN",
    );
  });

  it("refuses a foreign Origin on sign-in and sign-out without doing the work", async () => {
    const id = await newSession();
    const res = await request(app)
      .post("/api/auth/sign-in")
      .set("Origin", "https://evil.example")
      .send({ username: "maria", password: PASSWORD });
    expectError(res, 403, "FORBIDDEN_ORIGIN");
    expect(verifySpy).not.toHaveBeenCalled();
    const out = await request(app)
      .post("/api/auth/sign-out")
      .set("Origin", "https://evil.example")
      .set("Cookie", `__session=${id}`);
    expectError(out, 403, "FORBIDDEN_ORIGIN");
    expect((await me(`__session=${id}`)).status).toBe(200);
  });

  it("lets an allowed Origin and a missing Origin through, and ignores Origin on GET", async () => {
    const id = await newSession();
    const allowed = await request(app)
      .post("/api/auth/sign-out")
      .set("Origin", ORIGIN)
      .set("Cookie", `__session=${id}`);
    expect(allowed.status).toBe(204);
    expect((await request(app).post("/api/auth/sign-out")).status).toBe(204);
    const get = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(get.status).toBe(200);
  });

  it("refuses every Origin when none is allowed", async () => {
    const closed = makeApp({ allowedOrigins: [] });
    const res = await request(closed).post("/api/auth/sign-out").set("Origin", ORIGIN);
    expectError(res, 403, "FORBIDDEN_ORIGIN");
  });
});

describe("in-flight verification cap", () => {
  it("answers the fifth concurrent sign-in with 429 and frees the slots afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    verifySpy.mockImplementation(async (plain, hash) => {
      await gate;
      return actualVerify(plain, hash);
    });
    const pending = Array.from({ length: 5 }, async () => await signIn("maria", PASSWORD));
    const first = await Promise.race(pending);
    expectError(first, 429, "TOO_MANY_REQUESTS");

    // the cap is checked before the lock now, and a refused request reserves nothing
    expectError(await signIn("ghost", "x"), 429, "TOO_MANY_REQUESTS");
    expect(await db.collection("signInAttempts").countDocuments({ _id: "ghost" as never })).toBe(0);

    release();
    const all = await Promise.all(pending);
    expect(all.filter((r) => r.status === 429)).toHaveLength(1);
    expect(all.filter((r) => r.status === 200)).toHaveLength(4);
    expect(verifySpy).toHaveBeenCalledTimes(4);

    verifySpy.mockImplementation(actualVerify);
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });

  it("releases the slot of a locked-out request", async () => {
    const lockout = createLockout(db);
    for (let i = 0; i < 6; i++) await lockout.reserve("ghost", T0);
    for (let i = 0; i < 6; i++) expectError(await signIn("ghost", "x"), 429, "LOCKED");
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });

  it("releases the slot when the lockout store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi
      .spyOn(Collection.prototype, "findOneAndUpdate")
      .mockRejectedValue(new Error("db"));
    for (let i = 0; i < 6; i++) expectError(await signIn("maria", PASSWORD), 500, "INTERNAL_ERROR");
    spy.mockRestore();
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });

  it("never verifies more than 5 failed guesses in a window, even in concurrent waves", async () => {
    for (let i = 0; i < 4; i++)
      expectError(await signIn("maria", "wrong"), 401, "INVALID_CREDENTIALS");
    const wave = await Promise.all(Array.from({ length: 4 }, () => signIn("maria", "wrong")));
    const refused = wave.filter((r) => r.status === 429);
    expect(wave.filter((r) => r.status === 401)).toHaveLength(1);
    expect(refused).toHaveLength(3);
    for (const r of refused) expect(["LOCKED", "TOO_MANY_REQUESTS"]).toContain(r.body.error.code);
    expect(verifySpy).toHaveBeenCalledTimes(5);
    expectError(await signIn("maria", PASSWORD), 429, "LOCKED");
    expect(verifySpy).toHaveBeenCalledTimes(5);
  });

  it("releases its slot when verification throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifySpy.mockImplementation(() => Promise.reject(new Error("boom")));
    // 5 sequential faults would hit the cap of 4 if a slot leaked
    for (let i = 0; i < 5; i++) {
      expectError(await signIn("maria", PASSWORD), 500, "INTERNAL_ERROR");
    }
    verifySpy.mockImplementation(actualVerify);
    await createLockout(db).clear("maria");
    expect((await signIn("maria", PASSWORD)).status).toBe(200);
  });
});

describe("ensureIndexes", () => {
  it("creates the staff, session and lockout indexes, and is idempotent", async () => {
    const { db: fresh, stop: stopFresh } = await startTestDb();
    try {
      await ensureIndexes(fresh);
      await ensureIndexes(fresh);
      const staff = await fresh.collection("staff").indexes();
      expect(staff.some((i) => i.key.username === 1 && i.unique === true)).toBe(true);
      for (const name of ["sessions", "signInAttempts"]) {
        const idx = await fresh.collection(name).indexes();
        expect(idx.some((i) => i.key.expireAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
      }
    } finally {
      await stopFresh();
    }
  });
});

describe("error handler edge cases", () => {
  it("answers a library error with a non-4xx status as a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await newSession();
    const res = await request(app).get("/api/unavailable").set("Cookie", `__session=${id}`);
    expectError(res, 500, "INTERNAL_ERROR");
    expect(res.text).not.toMatch(/SECRET/);
  });

  it("treats a status outside 400-499 on a thrown value as a fault", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [200, 302, 399, 500, 503]) {
      const json = vi.fn();
      const res = { headersSent: false, status: vi.fn(() => ({ json })) };
      errorHandler(Object.assign(new Error("x"), { status }), {} as never, res as never, vi.fn());
      expect(res.status).toHaveBeenCalledWith(500);
    }
  });

  it("leaves a response that already started to the framework", () => {
    const next = vi.fn();
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    const err = new Error("late");
    errorHandler(err, {} as never, res as never, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("origin matching is exact", () => {
  it.each([
    "https://app.example.evil.com",
    "https://app.example:8443",
    "http://app.example",
    "HTTPS://APP.EXAMPLE",
    "https://app.example/",
  ])("refuses %s", async (origin) => {
    expectError(
      await request(app).post("/api/auth/sign-out").set("Origin", origin),
      403,
      "FORBIDDEN_ORIGIN",
    );
  });

  it("answers 403, not 400 or 413, when a foreign Origin comes with a bad body", async () => {
    const send = (body: string) =>
      request(app)
        .post("/api/auth/sign-in")
        .set("Origin", "https://evil.example")
        .set("Content-Type", "application/json")
        .send(body);
    expectError(await send('{"username":'), 403, "FORBIDDEN_ORIGIN");
    expectError(
      await send(JSON.stringify({ password: "a".repeat(20_000) })),
      403,
      "FORBIDDEN_ORIGIN",
    );
  });
});

describe("session cookie reading and clearing", () => {
  it("scans every __session value and uses the first valid one", async () => {
    const id = await newSession();
    for (const cookie of [
      `__session=junk; __session=${id}`,
      `__session=${id}; __session=junk`,
      `__session=; a=b; __session=${id}`,
    ]) {
      expect((await me(cookie)).status).toBe(200);
    }
    expectError(await me("__session=junk; __session=also-junk"), 401, "UNAUTHENTICATED");
  });

  it("clears the cookie on a 401 only when the request carried a __session value", async () => {
    for (const cookie of ["__session=junk", "__session=", `__session=${"B".repeat(43)}`]) {
      const res = await me(cookie);
      expectError(res, 401, "UNAUTHENTICATED");
      expect(setCookies(res)).toEqual([CLEARED]);
    }
    for (const res of [
      await me(),
      await me("other=1; session=2"),
      await request(app).get("/api/secret"),
      await request(app).get("/api/nope"),
    ]) {
      expect(res.status).toBe(401);
      expect(setCookies(res)).toHaveLength(0);
    }
  });
});

describe("sign-in on a shared device", () => {
  it("destroys the session carried by the request when another member signs in", async () => {
    const staffA = await createStaffModel(db).createStaff(
      { username: "ines", displayName: "Ines", passwordHash: nfcHash },
      T0,
    );
    const old = (await sessions().create(staffA.id, T0)).id;
    const res = await request(app)
      .post("/api/auth/sign-in")
      .set("Cookie", `__session=${old}`)
      .send({ username: "maria", password: PASSWORD });
    expect(res.status).toBe(200);
    expectError(await me(`__session=${old}`), 401, "UNAUTHENTICATED");
    expect((await me(`__session=${idFrom(res)}`)).status).toBe(200);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("keeps the carried session when the sign-in fails or is refused", async () => {
    const old = await newSession();
    const bad = await request(app)
      .post("/api/auth/sign-in")
      .set("Cookie", `__session=${old}`)
      .send({ username: "maria", password: "wrong" });
    expectError(bad, 401, "INVALID_CREDENTIALS");
    const invalid = await request(app)
      .post("/api/auth/sign-in")
      .set("Cookie", `__session=${old}`)
      .send({ username: "maria" });
    expectError(invalid, 400, "VALIDATION_ERROR");
    expect((await me(`__session=${old}`)).status).toBe(200);
  });

  it("ignores a junk cookie on sign-in without touching sessions", async () => {
    const deletes = vi.spyOn(Collection.prototype, "deleteOne");
    const res = await request(app)
      .post("/api/auth/sign-in")
      .set("Cookie", "__session=junk")
      .send({ username: "maria", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(deletes.mock.calls.filter((c) => JSON.stringify(c[0]).includes("junk"))).toHaveLength(0);
  });
});
