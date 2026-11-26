import type { Db } from "mongodb";
import { assertValidNow } from "./clock.js";
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

  return {
    // The check is the write: one atomic upsert counts this attempt and says whether it may proceed,
    // so concurrent guesses cannot all pass a stale "not locked" read. Window is fixed from the
    // first attempt; a locked attempt keeps counting but never extends the window.
    async reserve(username: string, now: Date): Promise<boolean> {
      assertValidNow(now);
      const expired = {
        $or: [
          { $eq: [{ $type: "$windowStart" }, "missing"] },
          { $lte: [{ $add: ["$windowStart", WINDOW_MS] }, { $literal: now }] },
        ],
      };
      // MongoDB retries an upsert on `_id` equality itself, so no duplicate-key handling here.
      const doc = await attempts.findOneAndUpdate(
        { _id: normaliseUsername(username) },
        [
          {
            $set: {
              count: { $cond: [expired, 1, { $add: ["$count", 1] }] },
              windowStart: { $cond: [expired, { $literal: now }, "$windowStart"] },
            },
          },
          { $set: { expireAt: { $add: ["$windowStart", WINDOW_MS] } } },
        ],
        { upsert: true, returnDocument: "after" },
      );
      return doc !== null && doc.count <= MAX_FAILURES;
    },

    async clear(username: string): Promise<void> {
      await attempts.deleteOne({ _id: normaliseUsername(username) });
    },
  };
}
