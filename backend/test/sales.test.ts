import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/indexes.js";
import { createSessions } from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

const ORIGIN = "https://app.example";
const T0 = new Date("2026-03-02T12:00:00Z");
const RANGE = { from: "2026-03-01T00:00:00Z", to: "2026-03-03T00:00:00Z" };

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;
let customerId: string;
let vehicleId: string;

const withSession = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
  r.set("Cookie", cookie).set("Origin", ORIGIN);

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

async function addService(name: string, price: number): Promise<string> {
  const res = await withSession(request(app).post("/api/services")).send({ name, price });
  expect(res.status).toBe(201);
  return res.body.id;
}

function sell(lines: { kind: "service" | "product"; refId: string; quantity: number }[]) {
  return withSession(request(app).post("/api/sales")).send({ customerId, vehicleId, lines });
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
  cookie = `__session=${(await createSessions(db).create(insertedId.toHexString(), T0)).id}`;
  app = createApp({ db, now: () => T0, allowedOrigins: [ORIGIN] });
});

afterAll(async () => {
  await stop();
});

beforeEach(async () => {
  await Promise.all(
    ["products", "services", "customers", "vehicles", "sales"].map((c) =>
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
  ).send({
    plate: "AB123CD",
    model: "Gol",
  });
  vehicleId = vehicle.body.id;
});

describe("sales", () => {
  it("AC2: a sale with a service and a product lowers the product stock by the amount sold", async () => {
    const wax = await addProduct("Cera", 1500, 10);
    const lavado = await addService("Lavado", 4000);

    const res = await sell([
      { kind: "service", refId: lavado, quantity: 1 },
      { kind: "product", refId: wax, quantity: 2 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(4000 + 2 * 1500);
    expect(res.body.status).toBe("active");
    expect(await stockOf(wax)).toBe(8);
  });

  it("AC3: a sale that needs more stock than available is refused and no quantity changes", async () => {
    const wax = await addProduct("Cera", 1500, 3);
    const lavado = await addService("Lavado", 4000);

    const res = await sell([
      { kind: "service", refId: lavado, quantity: 1 },
      { kind: "product", refId: wax, quantity: 5 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(wax)).toBe(3);
  });

  it("gives back the stock already taken when a later product is short", async () => {
    const wax = await addProduct("Cera", 1500, 5);
    const air = await addProduct("Ambientador", 800, 1);

    const res = await sell([
      { kind: "product", refId: wax, quantity: 2 },
      { kind: "product", refId: air, quantity: 2 },
    ]);
    expect(res.status).toBe(409);
    expect(await stockOf(wax)).toBe(5);
    expect(await stockOf(air)).toBe(1);
  });

  it("AC4: cancelling a sale gives the stock back, keeps it listed and leaves it out of the total", async () => {
    const wax = await addProduct("Cera", 1500, 4);
    const sale = await sell([{ kind: "product", refId: wax, quantity: 3 }]);
    expect(await stockOf(wax)).toBe(1);

    const cancelled = await withSession(request(app).post(`/api/sales/${sale.body.id}/cancel`));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(await stockOf(wax)).toBe(4);

    const list = await withSession(request(app).get("/api/sales")).query(RANGE);
    expect(list.body.sales).toHaveLength(1);
    expect(list.body.sales[0].status).toBe("cancelled");
  });

  it("refuses to cancel the same sale twice, so stock is not given back twice", async () => {
    const wax = await addProduct("Cera", 1500, 4);
    const sale = await sell([{ kind: "product", refId: wax, quantity: 1 }]);
    await withSession(request(app).post(`/api/sales/${sale.body.id}/cancel`));
    const again = await withSession(request(app).post(`/api/sales/${sale.body.id}/cancel`));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CANCELLED");
    expect(await stockOf(wax)).toBe(4);
  });

  it("AC5: changing a price does not change the total of an existing sale", async () => {
    const wax = await addProduct("Cera", 1500, 4);
    const sale = await sell([{ kind: "product", refId: wax, quantity: 2 }]);

    await withSession(request(app).patch(`/api/products/${wax}`)).send({ price: 9999 });

    const list = await withSession(request(app).get("/api/sales")).query(RANGE);
    expect(list.body.sales[0].total).toBe(sale.body.total);
    expect(list.body.sales[0].lines[0].unitPrice).toBe(1500);
  });

  it("AC6: a sale with no lines is refused", async () => {
    const res = await sell([]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AC9: a deactivated product cannot be added to a new sale but still shows on old sales", async () => {
    const wax = await addProduct("Cera", 1500, 4);
    const old = await sell([{ kind: "product", refId: wax, quantity: 1 }]);
    expect(old.status).toBe(201);

    await withSession(request(app).patch(`/api/products/${wax}`)).send({ active: false });

    const res = await sell([{ kind: "product", refId: wax, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INACTIVE_PRODUCT");

    const list = await withSession(request(app).get("/api/sales")).query(RANGE);
    expect(list.body.sales.map((s: { id: string }) => s.id)).toContain(old.body.id);
  });

  it("refuses a service that has no price yet", async () => {
    const res = await withSession(request(app).post("/api/services")).send({ name: "Encerado" });
    const res2 = await sell([{ kind: "service", refId: res.body.id, quantity: 1 }]);
    expect(res2.status).toBe(400);
  });

  it("refuses a vehicle that belongs to another customer", async () => {
    const other = await withSession(request(app).post("/api/customers")).send({
      name: "Juan",
      phone: "+54 11 5555-0002",
    });
    const lavado = await addService("Lavado", 4000);
    const res = await withSession(request(app).post("/api/sales")).send({
      customerId: other.body.id,
      vehicleId,
      lines: [{ kind: "service", refId: lavado, quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });

  it("lists sales inside a date range only", async () => {
    const lavado = await addService("Lavado", 4000);
    await sell([{ kind: "service", refId: lavado, quantity: 1 }]);
    const inside = await withSession(request(app).get("/api/sales")).query(RANGE);
    expect(inside.body.sales).toHaveLength(1);
    const outside = await withSession(request(app).get("/api/sales")).query({
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-02T00:00:00Z",
    });
    expect(outside.body.sales).toHaveLength(0);
  });

  it("requires a range and a staff session", async () => {
    const noRange = await withSession(request(app).get("/api/sales"));
    expect(noRange.status).toBe(400);
    const anon = await request(app).get("/api/sales").query(RANGE).set("Origin", ORIGIN);
    expect(anon.status).toBe(401);
  });
});
