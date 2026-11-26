import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Collection, type Db } from "mongodb";
import {
  DuplicateUsernameError,
  createStaffModel,
  ensureStaffIndexes,
} from "../src/models/staff.js";
import { startTestDb } from "./helpers.js";

const NOW = new Date("2026-01-01T00:00:00Z");
const input = { username: "maria", displayName: "Maria", passwordHash: "hash-1" };

let db: Db;
let stop: () => Promise<void>;
let staff: ReturnType<typeof createStaffModel>;

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
});
afterAll(async () => {
  await stop();
});
beforeEach(async () => {
  await db.collection("staff").deleteMany({});
  await ensureStaffIndexes(db);
  staff = createStaffModel(db);
});

describe("staff model", () => {
  it("round-trips a created member and the ids agree", async () => {
    const created = await staff.createStaff(input, NOW);
    expect(typeof created.id).toBe("string");
    expect(created.id).toMatch(/^[0-9a-f]{24}$/);
    expect(Object.keys(created)).toEqual(["id"]);
    const found = await staff.findByUsername("maria");
    expect(found).toEqual({ id: created.id, displayName: "Maria", passwordHash: "hash-1" });
    expect(Object.keys(found!).sort()).toEqual(["displayName", "id", "passwordHash"]);
  });

  it("looks up case- and whitespace-insensitively and stores lower-case", async () => {
    await staff.createStaff({ ...input, username: "  Maria " }, NOW);
    expect(await staff.findByUsername("  MARIA\t")).not.toBeNull();
    const raw = await db.collection("staff").findOne({});
    expect(raw?.username).toBe("maria");
    expect(raw?.createdAt).toEqual(NOW);
  });

  it("stores the display name trimmed", async () => {
    await staff.createStaff({ ...input, displayName: "  Maria  " }, NOW);
    expect((await staff.findByUsername("maria"))?.displayName).toBe("Maria");
  });

  it("returns null for an unknown name", async () => {
    await staff.createStaff(input, NOW);
    expect(await staff.findByUsername("nobody")).toBeNull();
  });

  it("returns null for non-string lookups without ever querying Mongo", async () => {
    await staff.createStaff(input, NOW);
    const findOne = vi.spyOn(Collection.prototype, "findOne");
    try {
      for (const bad of [{ $ne: null }, 42, undefined, null, ["maria"]]) {
        expect(await staff.findByUsername(bad as never)).toBeNull();
      }
      expect(findOne).not.toHaveBeenCalled();
    } finally {
      findOne.mockRestore();
    }
  });

  it("finds a member by id without exposing the hash", async () => {
    const created = await staff.createStaff(input, NOW);
    const found = await staff.findById(created.id);
    expect(found).toEqual({ id: created.id, displayName: "Maria" });
    expect(Object.keys(found!).sort()).toEqual(["displayName", "id"]);
    // the hash is never even loaded
    const findOne = vi.spyOn(Collection.prototype, "findOne");
    try {
      await staff.findById(created.id);
      expect(findOne.mock.calls[0]?.[1]).toEqual({ projection: { displayName: 1 } });
    } finally {
      findOne.mockRestore();
    }
  });

  it("returns null for an unknown or malformed id without throwing", async () => {
    await staff.createStaff(input, NOW);
    const findOne = vi.spyOn(Collection.prototype, "findOne");
    try {
      expect(await staff.findById("0".repeat(24))).toBeNull();
      const callsBefore = findOne.mock.calls.length;
      for (const bad of [
        "",
        "abc",
        "z".repeat(24),
        "a".repeat(12),
        "a".repeat(25),
        42,
        null,
        undefined,
        { $ne: null },
      ]) {
        expect(await staff.findById(bad as never)).toBeNull();
      }
      expect(findOne.mock.calls.length).toBe(callsBefore);
    } finally {
      findOne.mockRestore();
    }
  });

  it("lets exactly one of two concurrent creates with the same name win", async () => {
    const results = await Promise.allSettled([
      staff.createStaff(input, NOW),
      staff.createStaff({ ...input, username: "MARIA" }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(DuplicateUsernameError);
    expect(await db.collection("staff").countDocuments()).toBe(1);
  });

  it("caps the display name at 100 characters after trimming", async () => {
    await expect(
      staff.createStaff({ ...input, displayName: "a".repeat(101) }, NOW),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      staff.createStaff({ ...input, displayName: ` ${"a".repeat(100)} ` }, NOW),
    ).resolves.toHaveProperty("id");
  });

  it("rejects a duplicate, including a variant spelling", async () => {
    await staff.createStaff(input, NOW);
    await expect(staff.createStaff(input, NOW)).rejects.toBeInstanceOf(DuplicateUsernameError);
    await expect(staff.createStaff({ ...input, username: "MARIA " }, NOW)).rejects.toBeInstanceOf(
      DuplicateUsernameError,
    );
    expect(await db.collection("staff").countDocuments()).toBe(1);
  });

  it("creates a unique index on username", async () => {
    const idx = await db.collection("staff").indexes();
    expect(idx.some((i) => i.key.username === 1 && i.unique === true)).toBe(true);
  });

  it("rejects invalid input with TypeError, not as a duplicate", async () => {
    const bad = [
      { ...input, username: 5 },
      { ...input, username: undefined },
      { ...input, username: "   " },
      { ...input, username: "a".repeat(65) },
      { ...input, displayName: "" },
      { ...input, displayName: "   " },
      { ...input, displayName: 7 },
      { ...input, passwordHash: "" },
      { ...input, passwordHash: 7 },
    ];
    for (const b of bad) {
      await expect(staff.createStaff(b as never, NOW)).rejects.toBeInstanceOf(TypeError);
    }
    expect(await db.collection("staff").countDocuments()).toBe(0);
  });

  it("accepts a 64-character username", async () => {
    await expect(
      staff.createStaff({ ...input, username: "a".repeat(64) }, NOW),
    ).resolves.toBeDefined();
  });

  it("rejects an invalid now and never leaks the hash in errors", async () => {
    await expect(staff.createStaff(input, new Date("nope"))).rejects.toThrow("Invalid clock value");
    await expect(staff.createStaff(input, "2026" as never)).rejects.toBeInstanceOf(TypeError);
    const err = await staff.createStaff({ ...input, displayName: "" }, NOW).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("hash-1");
    await staff.createStaff(input, NOW);
    const dup = await staff.createStaff(input, NOW).catch((e: Error) => e);
    expect((dup as Error).message).not.toContain("hash-1");
  });

  it("rethrows non-duplicate database errors", async () => {
    const broken = createStaffModel({
      collection: () => ({
        insertOne: () => Promise.reject(Object.assign(new Error("boom"), { code: 12 })),
      }),
    } as never);
    await expect(broken.createStaff(input, NOW)).rejects.toThrow("boom");
    await expect(broken.createStaff(input, NOW)).rejects.not.toBeInstanceOf(DuplicateUsernameError);
    const lookalike = createStaffModel({
      collection: () => ({
        insertOne: () =>
          Promise.reject(Object.assign(new Error("not a driver error"), { code: 11000 })),
      }),
    } as never);
    await expect(lookalike.createStaff(input, NOW)).rejects.not.toBeInstanceOf(
      DuplicateUsernameError,
    );
  });
});
