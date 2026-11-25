import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { assertValidNow } from "./clock.js";

export const SESSION_DAYS = 14;
export const TOUCH_AFTER_MS = 3_600_000;

const SESSION_MS = SESSION_DAYS * 86_400_000;
const COLLECTION = "sessions";
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface Session {
  _id: string;
  staffId: string;
  createdAt: Date;
  lastUsedAt: Date;
  expireAt: Date;
}

const hashId = (id: string): string => createHash("sha256").update(id).digest("hex");
export const isValidSessionId = (id: unknown): id is string =>
  typeof id === "string" && ID_PATTERN.test(id);

export async function ensureSessionIndexes(db: Db): Promise<void> {
  // Housekeeping only: MongoDB purges roughly once a minute, so expiry is decided in code.
  await db.collection<Session>(COLLECTION).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}

export function createSessions(db: Db) {
  const sessions = db.collection<Session>(COLLECTION);

  return {
    async create(staffId: string, now: Date): Promise<{ id: string }> {
      assertValidNow(now);
      if (typeof staffId !== "string" || staffId.length === 0) {
        throw new TypeError("staffId must be a non-empty string");
      }
      const id = randomBytes(32).toString("base64url");
      await sessions.insertOne({
        _id: hashId(id),
        staffId,
        createdAt: now,
        lastUsedAt: now,
        expireAt: new Date(now.getTime() + SESSION_MS),
      });
      return { id };
    },

    async resolve(id: string, now: Date): Promise<{ staffId: string; touched: boolean } | null> {
      assertValidNow(now);
      if (!isValidSessionId(id)) return null;
      const nowLit = { $literal: now };
      const before = await sessions.findOneAndUpdate(
        { _id: hashId(id), lastUsedAt: { $gte: new Date(now.getTime() - SESSION_MS) } },
        [
          {
            $set: {
              lastUsedAt: {
                $cond: [
                  { $gte: [{ $subtract: [nowLit, "$lastUsedAt"] }, TOUCH_AFTER_MS] },
                  nowLit,
                  "$lastUsedAt",
                ],
              },
            },
          },
          { $set: { expireAt: { $add: ["$lastUsedAt", SESSION_MS] } } },
        ],
        { returnDocument: "before" },
      );
      if (!before) return null;
      return {
        staffId: before.staffId,
        touched: now.getTime() - before.lastUsedAt.getTime() >= TOUCH_AFTER_MS,
      };
    },

    async destroy(id: string): Promise<void> {
      if (!isValidSessionId(id)) return;
      await sessions.deleteOne({ _id: hashId(id) });
    },
  };
}
