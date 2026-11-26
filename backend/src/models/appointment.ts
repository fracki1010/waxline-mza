import { ObjectId, type Db, type Filter } from "mongodb";

const COLLECTION = "appointments";

export interface AppointmentDoc {
  _id: ObjectId;
  customerName: string;
  customerPhone: string;
  plate: string;
  model: string;
  serviceId: ObjectId;
  employeeId: ObjectId;
  start: Date;
  end: Date;
  status: "active" | "cancelled";
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentFields = Pick<
  AppointmentDoc,
  | "customerName"
  | "customerPhone"
  | "plate"
  | "model"
  | "serviceId"
  | "employeeId"
  | "start"
  | "end"
>;

export async function ensureAppointmentIndexes(db: Db): Promise<void> {
  // Serves the overlap check: same employee, ordered by start.
  await db.collection<AppointmentDoc>(COLLECTION).createIndex({ employeeId: 1, start: 1 });
}

export function createAppointmentModel(db: Db) {
  const appointments = db.collection<AppointmentDoc>(COLLECTION);

  return {
    // True when an active appointment of the same employee shares any time with [start, end).
    // Touching edges do not overlap: one ending exactly when the next starts is allowed.
    async hasOverlap(
      employeeId: ObjectId,
      start: Date,
      end: Date,
      exceptId?: ObjectId,
    ): Promise<boolean> {
      const filter: Filter<AppointmentDoc> = {
        employeeId,
        status: "active",
        start: { $lt: end },
        end: { $gt: start },
      };
      if (exceptId !== undefined) filter._id = { $ne: exceptId };
      return (await appointments.countDocuments(filter, { limit: 1 })) > 0;
    },

    async insert(fields: AppointmentFields, by: string, now: Date): Promise<AppointmentDoc> {
      const doc: Omit<AppointmentDoc, "_id"> = {
        ...fields,
        status: "active",
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await appointments.insertOne(doc as AppointmentDoc);
      return { ...doc, _id: insertedId } as AppointmentDoc;
    },

    async findById(id: ObjectId): Promise<AppointmentDoc | null> {
      return appointments.findOne({ _id: id });
    },

    async update(
      id: ObjectId,
      fields: AppointmentFields,
      by: string,
      now: Date,
    ): Promise<AppointmentDoc | null> {
      return appointments.findOneAndUpdate(
        { _id: id },
        { $set: { ...fields, updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
    },

    // Cancelling keeps the record; the status change is what frees the time.
    async cancel(id: ObjectId, by: string, now: Date): Promise<AppointmentDoc | null> {
      return appointments.findOneAndUpdate(
        { _id: id },
        { $set: { status: "cancelled", updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
    },

    // Active appointments whose start falls in [from, to), ordered by start.
    async listBetween(from: Date, to: Date): Promise<AppointmentDoc[]> {
      return appointments
        .find({ status: "active", start: { $gte: from, $lt: to } })
        .sort({ start: 1 })
        .toArray();
    },
  };
}
