import { ObjectId, type Db } from "mongodb";

const COLLECTION = "products";

export interface ProductDoc {
  _id: ObjectId;
  name: string;
  unit: string;
  price: number; // whole pesos
  quantity: number; // whole units, never below zero
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AdjustResult =
  { status: "ok"; doc: ProductDoc } | { status: "insufficient" } | { status: "not_found" };

export function createProductModel(db: Db) {
  const products = db.collection<ProductDoc>(COLLECTION);

  return {
    async list(): Promise<ProductDoc[]> {
      return products.find({}).sort({ name: 1 }).toArray();
    },

    async findById(id: ObjectId): Promise<ProductDoc | null> {
      return products.findOne({ _id: id });
    },

    async insert(
      input: { name: string; unit: string; price: number; quantity: number },
      by: string,
      now: Date,
    ): Promise<ProductDoc> {
      const doc: Omit<ProductDoc, "_id"> = {
        ...input,
        active: true,
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await products.insertOne(doc as ProductDoc);
      return { ...doc, _id: insertedId } as ProductDoc;
    },

    // Only the given fields change. Products are never deleted, so old sales keep their name and price.
    async update(
      id: ObjectId,
      changes: { name?: string; unit?: string; price?: number; active?: boolean },
      by: string,
      now: Date,
    ): Promise<ProductDoc | null> {
      return products.findOneAndUpdate(
        { _id: id },
        { $set: { ...changes, updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
    },

    // A removal is conditional on enough stock, so two sales can never take the same last unit.
    async adjust(id: ObjectId, delta: number, by: string, now: Date): Promise<AdjustResult> {
      const filter = delta < 0 ? { _id: id, quantity: { $gte: -delta } } : { _id: id };
      const doc = await products.findOneAndUpdate(
        filter,
        { $inc: { quantity: delta }, $set: { updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
      if (doc) return { status: "ok", doc };
      const exists = await products.countDocuments({ _id: id }, { limit: 1 });
      return { status: exists > 0 ? "insufficient" : "not_found" };
    },
  };
}
