import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/indexes.js";
import { createSessions } from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

// Offline replays: the same client id sent twice must produce one record and the original answer.
const ORIGIN = "https://app.example";
const T0 = new Date("2026-03-02T12:00:00Z");

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;
let staffId: string;
let customerId: string;
let vehicleId: string;

const withSession = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
  r.set("Cookie", cookie).set("Origin", ORIGIN);

async function addService(name: string, price: number): Promise<string> {
  const res = await withSession(request(app).post("/api/services")).send({ name, price });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function addProduct(name: string, price: number, quantity: number): Promise<string> {
  const res = await withSession(request(app).post("/api/products")).send({
    name,
    unit: "unidad",
    price,
    quantity,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function stockOf(id: string): Promise<number> {
  const list = await withSession(request(app).get("/api/products"));
  return list.body.products.find((p: { id: string }) => p.id === id).quantity;
}

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureIndexes(db);
  const { insertedId } = await db
    .collection("staff")
    .insertOne({ username: "ana", displayName: "Ana", passwordHash: "x", createdAt: T0 });
  staffId = insertedId.toHexString();
  cookie = `__session=${(await createSessions(db).create(staffId, T0)).id}`;
  app = createApp({ db, now: () => T0, allowedOrigins: [ORIGIN] });
});

afterAll(async () => {
  await stop();
});

beforeEach(async () => {
  await Promise.all(
    ["products", "services", "customers", "vehicles", "sales", "appointments"].map((c) =>
      db.collection(c).deleteMany({}),
    ),
  );
  const customer = await withSession(request(app).post("/api/customers")).send({
    name: "María",
    phone: "+54 11 5555-0001",
  });
  customerId = customer.body.id;
  const vehicle = await withSession(
    request(app).post(`/api/customers/${customerId}/vehicles`),
  ).send({ plate: "AB123CD", model: "Gol" });
  vehicleId = vehicle.body.id;
});

describe("client ids on offline writes", () => {
  it("an appointment sent twice with the same id is created once and answers the same record", async () => {
    const serviceId = await addService("Lavado", 4000);
    const clientId = randomUUID();
    const body = {
      clientId,
      customerName: "Juan",
      customerPhone: "+54 11 5555-1234",
      plate: "AB123CD",
      model: "Gol",
      serviceId,
      employeeId: staffId,
      start: "2026-03-02T13:00:00Z",
      end: "2026-03-02T14:00:00Z",
    };
    const first = await withSession(request(app).post("/api/appointments")).send(body);
    expect(first.status).toBe(201);
    const second = await withSession(request(app).post("/api/appointments")).send(body);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await db.collection("appointments").countDocuments({ clientId })).toBe(1);
  });

  it("a customer sent twice with the same id is created once", async () => {
    const clientId = randomUUID();
    const body = { clientId, name: "Marta", phone: "+54 11 5555-0202" };
    const first = await withSession(request(app).post("/api/customers")).send(body);
    expect(first.status).toBe(201);
    const second = await withSession(request(app).post("/api/customers")).send(body);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await db.collection("customers").countDocuments({ clientId })).toBe(1);
  });

  it("a vehicle sent twice with the same id is created once", async () => {
    const clientId = randomUUID();
    const body = { clientId, plate: "MZ123AB", model: "Clio" };
    const path = `/api/customers/${customerId}/vehicles`;
    const first = await withSession(request(app).post(path)).send(body);
    expect(first.status).toBe(201);
    const second = await withSession(request(app).post(path)).send(body);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await db.collection("vehicles").countDocuments({ clientId })).toBe(1);
  });

  it("a sale sent twice takes its product stock only once", async () => {
    const wax = await addProduct("Cera", 1500, 10);
    const clientId = randomUUID();
    const body = {
      clientId,
      customerId,
      vehicleId,
      lines: [{ kind: "product", refId: wax, quantity: 2 }],
    };
    const first = await withSession(request(app).post("/api/sales")).send(body);
    expect(first.status).toBe(201);
    const second = await withSession(request(app).post("/api/sales")).send(body);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await stockOf(wax)).toBe(8);
    expect(await db.collection("sales").countDocuments({ clientId })).toBe(1);
  });

  it("a malformed client id is refused before any write", async () => {
    const res = await withSession(request(app).post("/api/customers")).send({
      clientId: "not-a-uuid",
      name: "Marta",
      phone: "+54 11 5555-0303",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await db.collection("customers").countDocuments({ phone: "+54 11 5555-0303" })).toBe(0);
  });
});
