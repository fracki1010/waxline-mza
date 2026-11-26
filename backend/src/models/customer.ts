import { ObjectId, type Db } from "mongodb";

const CUSTOMERS = "customers";
const VEHICLES = "vehicles";
const SEARCH_LIMIT = 50;

export interface CustomerDoc {
  _id: ObjectId;
  name: string;
  phone: string;
  clientId?: string;
  createdBy: string;
  createdAt: Date;
}

export interface VehicleDoc {
  _id: ObjectId;
  customerId: ObjectId;
  plate: string;
  model: string;
  clientId?: string;
  createdBy: string;
  createdAt: Date;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createCustomerModel(db: Db) {
  const customers = db.collection<CustomerDoc>(CUSTOMERS);
  const vehicles = db.collection<VehicleDoc>(VEHICLES);

  return {
    async findById(id: ObjectId): Promise<CustomerDoc | null> {
      return customers.findOne({ _id: id });
    },

    async vehiclesOf(customerIds: ObjectId[]): Promise<VehicleDoc[]> {
      return vehicles
        .find({ customerId: { $in: customerIds } })
        .sort({ plate: 1 })
        .toArray();
    },

    // Matches name or phone, or a customer who owns a vehicle with that plate.
    async search(term: string): Promise<CustomerDoc[]> {
      const pattern = new RegExp(escapeRegex(term), "i");
      const byPlate = await vehicles.find({ plate: pattern }).project({ customerId: 1 }).toArray();
      const plateOwners = byPlate.map((v) => v.customerId);
      return customers
        .find({ $or: [{ name: pattern }, { phone: pattern }, { _id: { $in: plateOwners } }] })
        .sort({ name: 1 })
        .limit(SEARCH_LIMIT)
        .toArray();
    },

    async list(): Promise<CustomerDoc[]> {
      return customers.find({}).sort({ name: 1 }).limit(SEARCH_LIMIT).toArray();
    },

    async findByClientId(clientId: string): Promise<CustomerDoc | null> {
      return customers.findOne({ clientId });
    },

    async findVehicleByClientId(clientId: string): Promise<VehicleDoc | null> {
      return vehicles.findOne({ clientId });
    },

    async insert(
      input: { name: string; phone: string },
      by: string,
      now: Date,
      clientId?: string,
    ): Promise<CustomerDoc> {
      const doc: Omit<CustomerDoc, "_id"> = {
        ...input,
        ...(clientId ? { clientId } : {}),
        createdBy: by,
        createdAt: now,
      };
      const { insertedId } = await customers.insertOne(doc as CustomerDoc);
      return { ...doc, _id: insertedId } as CustomerDoc;
    },

    async insertVehicle(
      customerId: ObjectId,
      input: { plate: string; model: string },
      by: string,
      now: Date,
      clientId?: string,
    ): Promise<VehicleDoc> {
      const doc: Omit<VehicleDoc, "_id"> = {
        customerId,
        ...input,
        ...(clientId ? { clientId } : {}),
        createdBy: by,
        createdAt: now,
      };
      const { insertedId } = await vehicles.insertOne(doc as VehicleDoc);
      return { ...doc, _id: insertedId } as VehicleDoc;
    },
  };
}
