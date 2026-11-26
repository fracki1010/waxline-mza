import type { Db } from "mongodb";
import { ensureClientIdIndex } from "./models/client-id.js";
import { ensureAppointmentIndexes } from "./models/appointment.js";
import { ensureStaffIndexes } from "./models/staff.js";
import { ensureLockoutIndexes } from "./services/lockout.js";
import { ensureSessionIndexes } from "./services/sessions.js";

// Without the unique staff index a duplicate username would be silently accepted.
// Without the unique client id index a replayed offline write would create a second record.
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    ensureLockoutIndexes(db),
    ensureSessionIndexes(db),
    ensureStaffIndexes(db),
    ensureAppointmentIndexes(db),
    ensureClientIdIndex(db.collection("appointments")),
    ensureClientIdIndex(db.collection("customers")),
    ensureClientIdIndex(db.collection("vehicles")),
    ensureClientIdIndex(db.collection("sales")),
  ]);
}
