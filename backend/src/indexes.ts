import type { Db } from "mongodb";
import { ensureStaffIndexes } from "./models/staff.js";
import { ensureLockoutIndexes } from "./services/lockout.js";
import { ensureSessionIndexes } from "./services/sessions.js";

// Without the unique staff index a duplicate username would be silently accepted.
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([ensureLockoutIndexes(db), ensureSessionIndexes(db), ensureStaffIndexes(db)]);
}
