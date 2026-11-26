import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createLockout, ensureLockoutIndexes } from "../src/services/lockout.js";
import { startTestDb } from "./helpers.js";

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

let db: Db;
let stop: () => Promise<void>;
let lockout: ReturnType<typeof createLockout>;

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureLockoutIndexes(db);
});
afterAll(async () => {
  await stop();
});
beforeEach(async () => {
  await db.collection("signInAttempts").deleteMany({});
  lockout = createLockout(db);
});

async function attempt(user: string, n: number, now: Date) {
  const results: boolean[] = [];
  for (let i = 0; i < n; i++) results.push(await lockout.reserve(user, now));
  return results;
}
const doc = (id: string) => db.collection("signInAttempts").findOne({ _id: id as never });

describe("lockout", () => {
  it("allows exactly 5 attempts per window and refuses the 6th", async () => {
    expect(await attempt("alice", 7, T0)).toEqual([true, true, true, true, true, false, false]);
  });

  it("normalises usernames with trim and lower-case", async () => {
    const names = ["Alice", " alice ", "ALICE", "alice", "\tAlIcE\n"];
    for (const n of names) expect(await lockout.reserve(n, T0)).toBe(true);
    expect(await lockout.reserve("  ALICE ", T0)).toBe(false);
    expect(await db.collection("signInAttempts").countDocuments()).toBe(1);
  });

  it("locks a never-seen username like any other", async () => {
    await attempt("ghost-user-123", 5, T0);
    expect(await lockout.reserve("ghost-user-123", T0)).toBe(false);
  });

  it("keeps users independent", async () => {
    await attempt("a", 6, T0);
    expect(await lockout.reserve("b", T0)).toBe(true);
  });

  it("respects the window boundary", async () => {
    await attempt("alice", 5, T0);
    expect(await lockout.reserve("alice", at(15 * MIN - 1000))).toBe(false);
    expect(await lockout.reserve("alice", at(15 * MIN - 1))).toBe(false);
    expect(await lockout.reserve("alice", at(15 * MIN))).toBe(true);
  });

  it("uses a fixed window, not a sliding one", async () => {
    await lockout.reserve("alice", T0);
    await attempt("alice", 4, at(10 * MIN));
    expect(await lockout.reserve("alice", at(14 * MIN))).toBe(false);
    const d = await doc("alice");
    expect(d?.windowStart).toEqual(T0);
    expect(d?.expireAt).toEqual(at(15 * MIN));
    expect(await lockout.reserve("alice", at(15 * MIN))).toBe(true);
  });

  it("starts a new window with count 1 after expiry", async () => {
    await attempt("alice", 6, T0);
    const later = at(15 * MIN);
    expect(await lockout.reserve("alice", later)).toBe(true);
    const d = await doc("alice");
    expect(d?.count).toBe(1);
    expect(d?.windowStart).toEqual(later);
    expect(d?.expireAt).toEqual(at(30 * MIN));
    expect(await attempt("alice", 4, at(16 * MIN))).toEqual([true, true, true, true]);
    expect(await lockout.reserve("alice", at(16 * MIN))).toBe(false);
  });

  it("does not reset the window one millisecond before expiry", async () => {
    await attempt("alice", 2, T0);
    await attempt("alice", 3, at(15 * MIN - 1));
    const d = await doc("alice");
    expect(d?.count).toBe(5);
    expect(d?.windowStart).toEqual(T0);
  });

  it("clear removes the lock and the document", async () => {
    await attempt("alice", 6, T0);
    await lockout.clear(" Alice ");
    expect(await db.collection("signInAttempts").countDocuments()).toBe(0);
    expect(await attempt("alice", 5, T0)).toEqual([true, true, true, true, true]);
  });

  it("clear on an unknown user is a no-op", async () => {
    await expect(lockout.clear("nobody")).resolves.toBeUndefined();
  });

  it("reserves atomically: 30 parallel calls give exactly 5 true", async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, () => lockout.reserve("alice", T0)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect((await doc("alice"))?.count).toBe(30);
  });

  it("stores only the allowed fields", async () => {
    await lockout.reserve("Alice", T0);
    const d = await db.collection("signInAttempts").findOne({});
    expect(Object.keys(d ?? {}).sort()).toEqual(["_id", "count", "expireAt", "windowStart"]);
    expect(d?._id).toBe("alice");
  });

  it("creates the TTL index idempotently", async () => {
    await ensureLockoutIndexes(db);
    await ensureLockoutIndexes(db);
    const idx = await db.collection("signInAttempts").indexes();
    const ttl = idx.filter((i) => i.key.expireAt === 1);
    expect(ttl).toHaveLength(1);
    expect(ttl[0]?.expireAfterSeconds).toBe(0);
  });
});

describe("lockout clock guard", () => {
  it("rejects an invalid clock instead of failing open", async () => {
    await expect(lockout.reserve("a", new Date(Number.NaN))).rejects.toThrow(TypeError);
    await expect(lockout.reserve("a", "2026" as never)).rejects.toThrow(TypeError);
    expect(await db.collection("signInAttempts").countDocuments()).toBe(0);
  });
});
