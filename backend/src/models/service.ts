import { ObjectId, type Db } from "mongodb";

const COLLECTION = "services";

export interface ServiceDoc {
  _id: ObjectId;
  name: string;
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createServiceModel(db: Db) {
  const services = db.collection<ServiceDoc>(COLLECTION);

  return {
    async list(): Promise<ServiceDoc[]> {
      return services.find({}).sort({ name: 1 }).toArray();
    },

    async findById(id: ObjectId): Promise<ServiceDoc | null> {
      return services.findOne({ _id: id });
    },

    async findNames(ids: ObjectId[]): Promise<Map<string, string>> {
      const docs = await services.find({ _id: { $in: ids } }).toArray();
      return new Map(docs.map((doc) => [doc._id.toHexString(), doc.name]));
    },

    async insert(name: string, by: string, now: Date): Promise<ServiceDoc> {
      const doc: Omit<ServiceDoc, "_id"> = {
        name,
        active: true,
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      };
      const { insertedId } = await services.insertOne(doc as ServiceDoc);
      return { ...doc, _id: insertedId } as ServiceDoc;
    },

    // Only the fields given change; services are never deleted, so old appointments keep their name.
    async update(
      id: ObjectId,
      changes: { name?: string; active?: boolean },
      by: string,
      now: Date,
    ): Promise<ServiceDoc | null> {
      return services.findOneAndUpdate(
        { _id: id },
        { $set: { ...changes, updatedBy: by, updatedAt: now } },
        { returnDocument: "after" },
      );
    },
  };
}
