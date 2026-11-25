import type { Db } from "mongodb";
import { normaliseUsername } from "./username.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const COLLECTION = "signInAttempts";

interface Attempt {
  _id: string;
  count: number;
  windowStart: Date;
  expireAt: Date;
}

export async function ensureLockoutIndexes(db: Db): Promise<void> {
  // Housekeeping only: MongoDB purges roughly once a minute, so expiry is decided in code.
  await db.collection<Attempt>(COLLECTION).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}

export function createLockout(db: Db) {
  const attempts = db.collection<Attempt>(COLLECTION);

  async function upsertFailure(id: string, now: Date): Promise<void> {
    // Atomic, and MongoDB retries an upsert on `_id` equality itself, so no duplicate-key handling here.
    const expired = {
      $or: [
        { $eq: [{ $type: "$windowStart" }, "missing"] },
        { $lte: [{ $add: ["$windowStart", WINDOW_MS] }, { $literal: now }] },
      ],
    };
    await attempts.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            count: { $cond: [expired, 1, { $add: ["$count", 1] }] },
            windowStart: { $cond: [expired, { $literal: now }, "$windowStart"] },
          },
        },
        { $set: { expireAt: { $add: ["$windowStart", WINDOW_MS] } } },
      ],
      { upsert: true },
    );
  }

  return {
    async isLocked(username: string, now: Date): Promise<boolean> {
      const doc = await attempts.findOne({ _id: normaliseUsername(username) });
      return (
        doc !== null &&
        now.getTime() < doc.windowStart.getTime() + WINDOW_MS &&
        doc.count >= MAX_FAILURES
      );
    },

    async recordFailure(username: string, now: Date): Promise<void> {
      await upsertFailure(normaliseUsername(username), now);
    },

    async clear(username: string): Promise<void> {
      await attempts.deleteOne({ _id: normaliseUsername(username) });
    },
  };
}
