import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import {
  SESSION_DAYS,
  TOUCH_AFTER_MS,
  createSessions,
  ensureSessionIndexes,
  isValidSessionId,
} from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let db: Db;
let stop: () => Promise<void>;
let sessions: ReturnType<typeof createSessions>;

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureSessionIndexes(db);
});
afterAll(async () => {
  await stop();
});
beforeEach(async () => {
  await db.collection("sessions").deleteMany({});
  sessions = createSessions(db);
});

describe("sessions", () => {
  it("exports the agreed constants", () => {
    expect(SESSION_DAYS).toBe(14);
    expect(TOUCH_AFTER_MS).toBe(HOUR);
  });

  describe("create", () => {
    it("returns a 43-char base64url id, different each time", async () => {
      const a = await sessions.create("s1", T0);
      const b = await sessions.create("s1", T0);
      expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(b.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a.id).not.toBe(b.id);
    });

    it("stores only the hash of the id, with exactly five fields", async () => {
      const { id } = await sessions.create("staff-1", T0);
      const docs = await db.collection("sessions").find().toArray();
      expect(docs).toHaveLength(1);
      const doc = docs[0]!;
      expect(doc._id).toBe(sha(id));
      expect(JSON.stringify(doc)).not.toContain(id);
      expect(Object.keys(doc).sort()).toEqual(
        ["_id", "createdAt", "expireAt", "lastUsedAt", "staffId"].sort(),
      );
      expect(doc.staffId).toBe("staff-1");
      expect(doc.createdAt).toEqual(T0);
      expect(doc.lastUsedAt).toEqual(T0);
      expect(doc.expireAt).toEqual(at(14 * DAY));
    });
  });

  describe("resolve", () => {
    it("returns the staffId untouched right after create", async () => {
      const { id } = await sessions.create("staff-1", T0);
      expect(await sessions.resolve(id, T0)).toEqual({ staffId: "staff-1", touched: false });
    });

    it("reports the staffId each session was created with", async () => {
      const a = await sessions.create("staff-a", T0);
      const b = await sessions.create("staff-b", T0);
      expect((await sessions.resolve(a.id, at(1000)))?.staffId).toBe("staff-a");
      expect((await sessions.resolve(b.id, at(1000)))?.staffId).toBe("staff-b");
    });

    it("does not touch at 59m59.999s and touches at exactly 1h", async () => {
      const { id } = await sessions.create("s", T0);
      const col = db.collection("sessions");

      expect(await sessions.resolve(id, at(HOUR - 1))).toEqual({ staffId: "s", touched: false });
      const before = await col.findOne({ _id: sha(id) as never });
      expect(before?.lastUsedAt).toEqual(T0);
      expect(before?.expireAt).toEqual(at(14 * DAY));

      expect(await sessions.resolve(id, at(HOUR))).toEqual({ staffId: "s", touched: true });
      const after = await col.findOne({ _id: sha(id) as never });
      expect(after?.lastUsedAt).toEqual(at(HOUR));
      expect(after?.expireAt).toEqual(at(HOUR + 14 * DAY));
      expect(after?.createdAt).toEqual(T0);
    });

    it("is valid at exactly 14 days, refused 1 ms later, and keeps the record", async () => {
      const { id } = await sessions.create("s", T0);
      expect(await sessions.resolve(id, at(14 * DAY + 1))).toBeNull();
      expect(await db.collection("sessions").countDocuments()).toBe(1);
      const doc = await db.collection("sessions").findOne({});
      expect(doc?.lastUsedAt).toEqual(T0);
      expect(await sessions.resolve(id, at(14 * DAY))).toEqual({ staffId: "s", touched: true });
    });

    it("is refused at day 15 with the record still present", async () => {
      const { id } = await sessions.create("s", T0);
      expect(await sessions.resolve(id, at(15 * DAY))).toBeNull();
      expect(await db.collection("sessions").countDocuments()).toBe(1);
    });

    it("is valid on day 13", async () => {
      const { id } = await sessions.create("s", T0);
      expect(await sessions.resolve(id, at(13 * DAY))).toEqual({ staffId: "s", touched: true });
    });

    it("slides: touched on day 10, valid on day 24, refused 1 ms later", async () => {
      const { id } = await sessions.create("s", T0);
      expect((await sessions.resolve(id, at(10 * DAY)))?.touched).toBe(true);
      expect(await sessions.resolve(id, at(24 * DAY + 1))).toBeNull();
      expect(await sessions.resolve(id, at(24 * DAY))).toEqual({ staffId: "s", touched: true });
    });

    it("returns null for an unknown well-formed id", async () => {
      await sessions.create("s", T0);
      expect(await sessions.resolve("A".repeat(43), T0)).toBeNull();
    });

    it("returns null for malformed ids without throwing", async () => {
      await sessions.create("s", T0);
      const bad: unknown[] = [
        "",
        "A".repeat(42),
        "A".repeat(44),
        "A".repeat(42) + "+",
        "A".repeat(42) + "=",
        42,
        { $ne: null },
        undefined,
        null,
      ];
      for (const id of bad) {
        expect(await sessions.resolve(id as string, T0)).toBeNull();
      }
    });

    it("yields exactly one touched=true among 10 concurrent resolves", async () => {
      const { id } = await sessions.create("s", T0);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => sessions.resolve(id, at(HOUR))),
      );
      expect(results.every((r) => r?.staffId === "s")).toBe(true);
      expect(results.filter((r) => r?.touched).length).toBe(1);
    });
  });

  describe("destroy", () => {
    it("removes only that session", async () => {
      const a = await sessions.create("same", T0);
      const b = await sessions.create("same", T0);
      await sessions.destroy(a.id);
      expect(await sessions.resolve(a.id, T0)).toBeNull();
      expect(await sessions.resolve(b.id, T0)).toEqual({ staffId: "same", touched: false });
      expect(await db.collection("sessions").countDocuments()).toBe(1);
    });

    it("is a no-op for unknown or malformed ids", async () => {
      const a = await sessions.create("s", T0);
      await sessions.destroy("A".repeat(43));
      await sessions.destroy("");
      await sessions.destroy({ $ne: null } as unknown as string);
      await sessions.destroy(undefined as unknown as string);
      expect(await db.collection("sessions").countDocuments()).toBe(1);
      expect(await sessions.resolve(a.id, T0)).not.toBeNull();
    });
  });

  describe("ensureSessionIndexes", () => {
    it("creates a TTL index on expireAt and is idempotent", async () => {
      await ensureSessionIndexes(db);
      await ensureSessionIndexes(db);
      const idx = await db.collection("sessions").indexes();
      const ttl = idx.filter((i) => i.key.expireAt === 1);
      expect(ttl).toHaveLength(1);
      expect(ttl[0]?.expireAfterSeconds).toBe(0);
    });
  });
});

describe("sessions hardening", () => {
  it("rejects an invalid clock instead of failing open", async () => {
    const { id } = await sessions.create("s1", T0);
    await expect(sessions.resolve(id, new Date(Number.NaN))).rejects.toThrow(TypeError);
    await expect(sessions.create("s1", new Date(Number.NaN))).rejects.toThrow(TypeError);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("rejects a staffId that is not a non-empty string", async () => {
    for (const bad of [undefined, null, "", 42, { $x: 1 }]) {
      await expect(sessions.create(bad as never, T0)).rejects.toThrow(TypeError);
    }
    expect(await db.collection("sessions").countDocuments()).toBe(0);
  });

  it("isValidSessionId accepts exactly 43 base64url characters, anchored at both ends", () => {
    const ok = "A".repeat(43);
    expect(isValidSessionId(ok)).toBe(true);
    expect(isValidSessionId(`${"a-Z_9".repeat(8)}abc`)).toBe(true);
    const bad = [
      `${ok}A`,
      `A${ok}`,
      ok.slice(1),
      `${ok}\n`,
      `\n${ok}`,
      `${ok.slice(0, 42)}=`,
      `${ok.slice(0, 42)}+`,
      ` ${ok.slice(1)}`,
      "",
    ];
    for (const id of bad) expect(isValidSessionId(id), JSON.stringify(id)).toBe(false);
    for (const id of [42, null, undefined, { $ne: null }]) expect(isValidSessionId(id)).toBe(false);
  });
});
