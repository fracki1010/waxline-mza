import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/indexes.js";
import { DuplicateUsernameError } from "../src/models/staff.js";
import {
  InvalidPasswordError,
  MIN_PASSWORD_LENGTH,
  createFirstStaff,
  describeFailure,
  exitCodeFor,
  parseArgs,
} from "../src/scripts/create-staff.js";
import { hashPassword, verifyPassword } from "../src/services/hash.js";
import { startTestDb } from "./helpers.js";

vi.mock("../src/services/hash.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/hash.js")>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});
const hashSpy = vi.mocked(hashPassword);

const NOW = new Date("2026-03-01T12:00:00Z");
const PASSWORD = "correct horse battery";
const ORIGIN = "https://app.example";

let db: Db;
let stop: () => Promise<void>;
let logs: string[];

const staff = () => db.collection("staff");
const create = (over: Partial<Parameters<typeof createFirstStaff>[0]> = {}) =>
  createFirstStaff({
    db,
    username: "maria",
    displayName: "Maria",
    password: PASSWORD,
    now: NOW,
    ...over,
  });

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
});
afterAll(async () => {
  await stop();
});
beforeEach(() => {
  logs = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  hashSpy.mockClear();
  await staff().deleteMany({});
});

describe("createFirstStaff", () => {
  it("stores a verifiable hash of the NFKC-normalised password and no plaintext", async () => {
    const { id } = await create({ password: "ｐａｓｓｗｏｒｄ１２３４" });
    const doc = await staff().findOne({});
    expect(doc?._id.toHexString()).toBe(id);
    expect(await verifyPassword("password1234", doc?.passwordHash)).toBe(true);
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain("password1234");
    expect(raw).not.toContain("ｐａｓｓｗｏｒｄ");
    expect(logs.join("\n")).not.toContain("password");
  });

  it("creates the unique index itself so duplicates cannot slip in", async () => {
    await create();
    const indexes = await staff().indexes();
    expect(indexes.some((i) => i.unique === true && i.key.username === 1)).toBe(true);
  });

  it("signs in through the real routes, including with a non-canonical typed form", async () => {
    await ensureIndexes(db);
    await create({ username: "Maria", password: "ｐａｓｓｗｏｒｄ１２３４" });
    const app = createApp({ db, now: () => NOW, allowedOrigins: [ORIGIN] });
    const ok = await request(app)
      .post("/api/auth/sign-in")
      .set("Origin", ORIGIN)
      .send({ username: "maria", password: "password1234" });
    expect(ok.status).toBe(200);
    const fullwidth = await request(app)
      .post("/api/auth/sign-in")
      .set("Origin", ORIGIN)
      .send({ username: "MARIA", password: "ｐａｓｓｗｏｒｄ１２３４" });
    expect(fullwidth.status).toBe(200);
    const wrong = await request(app)
      .post("/api/auth/sign-in")
      .set("Origin", ORIGIN)
      .send({ username: "maria", password: "password1235" });
    expect(wrong.status).toBe(401);
  });

  it.each([
    ["empty", ""],
    ["9 characters", "123456789"],
    ["short once normalised", "ｐａｓｓ１２３４５"],
    ["lone surrogate", "valid-prefix-\ud800-tail"],
    ["over 1024 characters", "a".repeat(1025)],
    ["not a string", 12345678901 as unknown as string],
  ])("rejects a %s password before hashing and inserts nothing", async (_n, password) => {
    const error = await create({ password }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidPasswordError);
    expect(hashSpy).not.toHaveBeenCalled();
    expect(await staff().countDocuments()).toBe(0);
    expect(String((error as Error).message)).not.toContain("123456789");
  });

  it("accepts exactly the minimum length", async () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    await create({ password: "1234567890" });
    expect(await staff().countDocuments()).toBe(1);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });

  it("measures the length after normalising", async () => {
    // "ﬁ" (U+FB01) becomes "fi", so 5 of them are 10 characters once normalised.
    await create({ password: "ﬁﬁﬁﬁﬁ" });
    expect(await staff().countDocuments()).toBe(1);
  });

  it("throws DuplicateUsernameError for the same or a variant spelling and inserts nothing", async () => {
    await create();
    for (const username of ["maria", "  MARIA "]) {
      await expect(create({ username })).rejects.toBeInstanceOf(DuplicateUsernameError);
    }
    expect(await staff().countDocuments()).toBe(1);
  });

  it("never puts the password in an error or in console output", async () => {
    const secret = "Zq9-unique-secret-value";
    await create({ password: secret });
    const errors: unknown[] = [];
    errors.push(await create({ password: secret }).catch((e: unknown) => e));
    errors.push(await create({ password: "short-1" }).catch((e: unknown) => e));
    errors.push(await create({ username: "", password: secret }).catch((e: unknown) => e));
    for (const e of errors) {
      expect(e).toBeInstanceOf(Error);
      expect(JSON.stringify(e) + String((e as Error).stack) + describeFailure(e)).not.toContain(
        secret,
      );
    }
    expect(logs.join("\n")).not.toContain(secret);
  });
});

describe("parseArgs", () => {
  it("takes exactly two positional arguments", () => {
    expect(parseArgs(["maria", "Maria Perez"])).toEqual({
      username: "maria",
      displayName: "Maria Perez",
    });
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(["maria"])).toBeNull();
    expect(parseArgs(["a", "b", "c"])).toBeNull();
  });
});

describe("exitCodeFor and describeFailure", () => {
  it("maps outcomes to exit codes and short safe messages", () => {
    expect(exitCodeFor(undefined)).toBe(0);
    expect(exitCodeFor(new DuplicateUsernameError())).toBe(1);
    expect(exitCodeFor(new Error("boom"))).toBe(1);
    expect(describeFailure(new DuplicateUsernameError())).toBe("Username already exists");
    expect(describeFailure(new InvalidPasswordError())).toMatch(/at least 10/);
    expect(describeFailure(new TypeError("Invalid username"))).toBe("Invalid username");
    // Unknown errors (driver, network) may embed the connection string, so they are not echoed.
    const generic = describeFailure(new Error("mongodb://user:pw@host failed"));
    expect(generic).not.toContain("pw");
  });
});
