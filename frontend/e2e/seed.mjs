// Local test data only: seeds the E2E database. Values are throwaway test values, never production data.
import { createRequire } from "node:module";
import { env } from "node:process";

const require = createRequire(import.meta.url);
const backend = new URL("../../backend/", import.meta.url);
const { MongoClient, ObjectId } = require(new URL("node_modules/mongodb", backend).pathname);
const { ensureIndexes } = await import(new URL("dist/indexes.js", backend));
const { hashPassword } = await import(new URL("dist/services/hash.js", backend));
const { createStaffModel } = await import(new URL("dist/models/staff.js", backend));

export const E2E = {
  username: "e2e-staff",
  password: "e2e-password-123",
  displayName: "E2E Staff",
};

const uri = env.E2E_MONGO_URI ?? "mongodb://127.0.0.1:27018/waxline_e2e";
const client = await MongoClient.connect(uri);
const db = client.db();
await db.dropDatabase();
await ensureIndexes(db);

const now = new Date();
const staff = createStaffModel(db);
await staff.createStaff(
  {
    username: E2E.username,
    displayName: E2E.displayName,
    passwordHash: await hashPassword(E2E.password),
  },
  now,
);
const ana = await staff.createStaff(
  {
    username: "e2e-ana",
    displayName: "Ana",
    passwordHash: await hashPassword("unused-password-1"),
  },
  now,
);
const services = db.collection("services");
const lavado = new ObjectId();
await services.insertMany([
  { _id: lavado, name: "Lavado completo", active: true, createdAt: now, updatedAt: now },
  { _id: new ObjectId(), name: "Encerado", active: false, createdAt: now, updatedAt: now },
]);

// One existing appointment for Ana today, 10:00-11:00 local, so the overlap rule can be tested.
const day = new Date();
day.setHours(10, 0, 0, 0);
const end = new Date(day);
end.setHours(11);
await db.collection("appointments").insertOne({
  customerName: "Juan Pérez",
  customerPhone: "+54 11 5555-1234",
  plate: "AB123CD",
  model: "Gol",
  serviceId: lavado,
  employeeId: new ObjectId(ana.id),
  start: day,
  end,
  status: "active",
  createdBy: "seed",
  updatedBy: "seed",
  createdAt: now,
  updatedAt: now,
});

await client.close();
console.log("seeded", uri);
