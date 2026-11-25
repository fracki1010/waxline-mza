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

async function fail(user: string, n: number, now: Date) {
  for (let i = 0; i < n; i++) await lockout.recordFailure(user, now);
}

describe("lockout", () => {
  it("locks on the 5th failure, not before", async () => {
    await fail("alice", 4, T0);
    expect(await lockout.isLocked("alice", T0)).toBe(false);
    await lockout.recordFailure("alice", T0);
    expect(await lockout.isLocked("alice", T0)).toBe(true);
    await lockout.recordFailure("alice", T0);
    expect(await lockout.isLocked("alice", T0)).toBe(true);
  });

  it("is false for a user with no failures", async () => {
    expect(await lockout.isLocked("nobody", T0)).toBe(false);
  });

  it("normalises usernames with trim and lower-case", async () => {
    await lockout.recordFailure("Alice", T0);
    await lockout.recordFailure(" alice ", T0);
    await lockout.recordFailure("ALICE", T0);
    await lockout.recordFailure("alice", T0);
    expect(await lockout.isLocked("alice", T0)).toBe(false);
    await lockout.recordFailure("\tAlIcE\n", T0);
    expect(await lockout.isLocked("alice", T0)).toBe(true);
    expect(await lockout.isLocked("  ALICE ", T0)).toBe(true);
    expect(await db.collection("signInAttempts").countDocuments()).toBe(1);
  });

  it("locks a never-seen username like any other", async () => {
    await fail("ghost-user-123", 5, T0);
    expect(await lockout.isLocked("ghost-user-123", T0)).toBe(true);
  });

  it("keeps users independent", async () => {
    await fail("a", 5, T0);
    expect(await lockout.isLocked("a", T0)).toBe(true);
    expect(await lockout.isLocked("b", T0)).toBe(false);
    await lockout.recordFailure("b", T0);
    expect(await lockout.isLocked("b", T0)).toBe(false);
  });

  it("respects the window boundary", async () => {
    await fail("alice", 5, T0);
    expect(await lockout.isLocked("alice", at(15 * MIN - 1000))).toBe(true);
    expect(await lockout.isLocked("alice", at(15 * MIN - 1))).toBe(true);
    expect(await lockout.isLocked("alice", at(15 * MIN))).toBe(false);
    expect(await lockout.isLocked("alice", at(15 * MIN + 1000))).toBe(false);
  });

  it("uses a fixed window, not a sliding one", async () => {
    await lockout.recordFailure("alice", T0);
    await fail("alice", 4, at(10 * MIN));
    expect(await lockout.isLocked("alice", at(10 * MIN))).toBe(true);
    expect(await lockout.isLocked("alice", at(14 * MIN))).toBe(true);
    expect(await lockout.isLocked("alice", at(15 * MIN))).toBe(false);
    const doc = await db.collection("signInAttempts").findOne({ _id: "alice" as never });
    expect(doc?.windowStart).toEqual(T0);
    expect(doc?.expireAt).toEqual(at(15 * MIN));
  });

  it("starts a new window with count 1 after expiry", async () => {
    await fail("alice", 5, T0);
    const later = at(15 * MIN);
    await lockout.recordFailure("alice", later);
    const doc = await db.collection("signInAttempts").findOne({ _id: "alice" as never });
    expect(doc?.count).toBe(1);
    expect(doc?.windowStart).toEqual(later);
    expect(doc?.expireAt).toEqual(at(30 * MIN));
    await fail("alice", 3, at(16 * MIN));
    expect(await lockout.isLocked("alice", at(16 * MIN))).toBe(false);
    await lockout.recordFailure("alice", at(16 * MIN));
    expect(await lockout.isLocked("alice", at(16 * MIN))).toBe(true);
  });

  it("does not reset the window one millisecond before expiry", async () => {
    await fail("alice", 2, T0);
    await fail("alice", 3, at(15 * MIN - 1));
    const doc = await db.collection("signInAttempts").findOne({ _id: "alice" as never });
    expect(doc?.count).toBe(5);
    expect(doc?.windowStart).toEqual(T0);
  });

  it("clear removes the lock and the document", async () => {
    await fail("alice", 5, T0);
    await lockout.clear(" Alice ");
    expect(await lockout.isLocked("alice", T0)).toBe(false);
    expect(await db.collection("signInAttempts").countDocuments()).toBe(0);
    await fail("alice", 4, T0);
    expect(await lockout.isLocked("alice", T0)).toBe(false);
  });

  it("clear on an unknown user is a no-op", async () => {
    await expect(lockout.clear("nobody")).resolves.toBeUndefined();
  });

  it("counts concurrent failures atomically", async () => {
    await Promise.all(Array.from({ length: 10 }, () => lockout.recordFailure("alice", T0)));
    const doc = await db.collection("signInAttempts").findOne({ _id: "alice" as never });
    expect(doc?.count).toBe(10);
  });

  it("stores only the allowed fields", async () => {
    await lockout.recordFailure("Alice", T0);
    const doc = await db.collection("signInAttempts").findOne({});
    expect(Object.keys(doc ?? {}).sort()).toEqual(["_id", "count", "expireAt", "windowStart"]);
    expect(doc?._id).toBe("alice");
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
