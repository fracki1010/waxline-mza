import { ObjectId, type Db } from "mongodb";

const COLLECTION = "sales";
const LIST_LIMIT = 200;

export interface SaleLine {
  kind: "service" | "product";
  refId: ObjectId;
  name: string;
  quantity: number;
  unitPrice: number; // whole pesos, copied at sale time so later price changes do not move old sales
  lineTotal: number;
}

export interface SaleDoc {
  _id: ObjectId;
  customerId: ObjectId;
  vehicleId: ObjectId;
  appointmentId?: ObjectId;
  clientId?: string;
  lines: SaleLine[];
  total: number;
  status: "active" | "cancelled";
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
}

export type CancelResult =
  { status: "ok"; doc: SaleDoc } | { status: "already_cancelled" } | { status: "not_found" };

export function createSaleModel(db: Db) {
  const sales = db.collection<SaleDoc>(COLLECTION);

  return {
    async findById(id: ObjectId): Promise<SaleDoc | null> {
      return sales.findOne({ _id: id });
    },

    async findByClientId(clientId: string): Promise<SaleDoc | null> {
      return sales.findOne({ clientId });
    },

    async list(from: Date, to: Date): Promise<SaleDoc[]> {
      return sales
        .find({ createdAt: { $gte: from, $lt: to } })
        .sort({ createdAt: 1 })
        .limit(LIST_LIMIT)
        .toArray();
    },

    async insert(
      input: Omit<
        SaleDoc,
        "_id" | "status" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"
      >,
      by: string,
      now: Date,
    ): Promise<SaleDoc> {
      const doc: Omit<SaleDoc, "_id"> = {
        ...input,
        status: "active",
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await sales.insertOne(doc as SaleDoc);
      return { ...doc, _id: insertedId } as SaleDoc;
    },

    // Cancelling keeps the sale listed; the status change happens only once, so a double click cannot cancel twice.
    async cancel(id: ObjectId, by: string, now: Date): Promise<CancelResult> {
      const doc = await sales.findOneAndUpdate(
        { _id: id, status: "active" },
        { $set: { status: "cancelled", cancelledAt: now, updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
      if (doc) return { status: "ok", doc };
      const exists = await sales.countDocuments({ _id: id }, { limit: 1 });
      return { status: exists > 0 ? "already_cancelled" : "not_found" };
    },
  };
}
