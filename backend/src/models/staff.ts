import { MongoServerError, type Db } from "mongodb";
import { assertValidNow } from "../services/clock.js";
import { normaliseUsername } from "../services/username.js";

const COLLECTION = "staff";
const MAX_USERNAME = 64;
const MAX_DISPLAY_NAME = 100;
const DUPLICATE_KEY = 11000;

interface Staff {
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super("Username already exists");
    this.name = "DuplicateUsernameError";
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export async function ensureStaffIndexes(db: Db): Promise<void> {
  await db.collection<Staff>(COLLECTION).createIndex({ username: 1 }, { unique: true });
}

export function createStaffModel(db: Db) {
  const staff = db.collection<Staff>(COLLECTION);

  return {
    async findByUsername(
      username: string,
    ): Promise<{ id: string; displayName: string; passwordHash: string } | null> {
      // Unknown or malformed input is "no such member", so sign-in answers 401 instead of failing with a 500.
      if (typeof username !== "string") return null;
      const doc = await staff.findOne({ username: normaliseUsername(username) });
      if (doc === null) return null;
      return {
        id: doc._id.toHexString(),
        displayName: doc.displayName,
        passwordHash: doc.passwordHash,
      };
    },

    async createStaff(
      input: { username: string; displayName: string; passwordHash: string },
      now: Date,
    ): Promise<{ id: string }> {
      assertValidNow(now);
      if (typeof input.username !== "string") throw new TypeError("Invalid username");
      const username = normaliseUsername(input.username);
      if (username.length === 0 || username.length > MAX_USERNAME) {
        throw new TypeError("Invalid username");
      }
      if (
        !isNonEmptyString(input.displayName) ||
        input.displayName.trim().length > MAX_DISPLAY_NAME
      ) {
        throw new TypeError("Invalid display name");
      }
      if (typeof input.passwordHash !== "string" || input.passwordHash.length === 0) {
        throw new TypeError("Invalid password hash");
      }
      try {
        const { insertedId } = await staff.insertOne({
          username,
          displayName: input.displayName.trim(),
          passwordHash: input.passwordHash,
          createdAt: now,
        });
        return { id: insertedId.toHexString() };
      } catch (error) {
        if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
          throw new DuplicateUsernameError();
        }
        throw error;
      }
    },
  };
}
