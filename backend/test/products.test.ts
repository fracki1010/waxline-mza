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

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;

const withSession = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
  r.set("Cookie", cookie).set("Origin", ORIGIN);

async function addProduct(body: Record<string, unknown> = {}) {
  return withSession(request(app).post("/api/products")).send({
    name: "Cera",
    unit: "unidad",
    price: 1500,
    quantity: 10,
    ...body,
  });
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
  await db.collection("products").deleteMany({});
});

describe("products", () => {
  it("AC1: adds a product with price and quantity and lists it", async () => {
    const created = await addProduct();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Cera",
      unit: "unidad",
      price: 1500,
      quantity: 10,
      active: true,
    });

    const list = await withSession(request(app).get("/api/products"));
    expect(list.body.products).toEqual([expect.objectContaining({ name: "Cera", quantity: 10 })]);
  });

  it("adds stock with a positive delta and takes it out with a negative one", async () => {
    const { body } = await addProduct({ quantity: 3 });
    const up = await withSession(request(app).post(`/api/products/${body.id}/adjust`)).send({
      delta: 5,
    });
    expect(up.body.quantity).toBe(8);
    const down = await withSession(request(app).post(`/api/products/${body.id}/adjust`)).send({
      delta: -2,
    });
    expect(down.body.quantity).toBe(6);
  });

  it("refuses a removal larger than the stock and leaves the quantity unchanged", async () => {
    const { body } = await addProduct({ quantity: 3 });
    const res = await withSession(request(app).post(`/api/products/${body.id}/adjust`)).send({
      delta: -10,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");

    const list = await withSession(request(app).get("/api/products"));
    expect(list.body.products[0].quantity).toBe(3);
  });

  it("deactivates a product and keeps it in the list", async () => {
    const { body } = await addProduct();
    const res = await withSession(request(app).patch(`/api/products/${body.id}`)).send({
      active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it("changes price and unit, and refuses a price that is not whole pesos", async () => {
    const { body } = await addProduct();
    const ok = await withSession(request(app).patch(`/api/products/${body.id}`)).send({
      price: 1800,
      unit: "litro",
    });
    expect(ok.body).toMatchObject({ price: 1800, unit: "litro" });

    const bad = await withSession(request(app).patch(`/api/products/${body.id}`)).send({
      price: 10.5,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses an add with a missing name or a negative quantity", async () => {
    const noName = await addProduct({ name: "" });
    expect(noName.status).toBe(400);
    const negative = await addProduct({ quantity: -1 });
    expect(negative.status).toBe(400);
  });

  it("refuses a zero or fractional adjustment", async () => {
    const { body } = await addProduct();
    const zero = await withSession(request(app).post(`/api/products/${body.id}/adjust`)).send({
      delta: 0,
    });
    expect(zero.status).toBe(400);
    const fraction = await withSession(request(app).post(`/api/products/${body.id}/adjust`)).send({
      delta: 1.5,
    });
    expect(fraction.status).toBe(400);
  });

  it("answers 404 for an unknown product", async () => {
    const res = await withSession(
      request(app).post("/api/products/000000000000000000000001/adjust"),
    ).send({ delta: 1 });
    expect(res.status).toBe(404);
  });

  it("requires a staff session", async () => {
    const res = await request(app).get("/api/products").set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });
});
