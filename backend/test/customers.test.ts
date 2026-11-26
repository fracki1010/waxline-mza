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

async function addCustomer(name: string, phone: string) {
  const res = await withSession(request(app).post("/api/customers")).send({ name, phone });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function search(q: string) {
  const res = await withSession(request(app).get("/api/customers")).query({ q });
  expect(res.status).toBe(200);
  return res.body.customers as { name: string; vehicles: { plate: string }[] }[];
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
  await db.collection("customers").deleteMany({});
  await db.collection("vehicles").deleteMany({});
});

describe("customers and vehicles", () => {
  it("AC7: finds a customer by name, phone or plate", async () => {
    const id = await addCustomer("María López", "+54 11 5555-0001");
    await withSession(request(app).post(`/api/customers/${id}/vehicles`)).send({
      plate: "AB123CD",
      model: "Gol",
    });
    await addCustomer("Juan Pérez", "+54 11 5555-0002");

    expect((await search("lópez")).map((c) => c.name)).toEqual(["María López"]);
    expect((await search("5555-0001")).map((c) => c.name)).toEqual(["María López"]);
    expect((await search("ab123")).map((c) => c.name)).toEqual(["María López"]);
    expect(await search("nadie")).toEqual([]);
  });

  it("treats the search text literally, so symbols do not break the query", async () => {
    await addCustomer("Ana", "+54 11 5555-0003");
    expect(await search("+54")).toHaveLength(1);
    expect(await search("(")).toEqual([]);
  });

  it("AC8: a customer keeps two vehicles and both come back with the customer", async () => {
    const id = await addCustomer("Lucía Gómez", "+54 11 5555-0004");
    await withSession(request(app).post(`/api/customers/${id}/vehicles`)).send({
      plate: "LM456KL",
      model: "Peugeot 208",
    });
    await withSession(request(app).post(`/api/customers/${id}/vehicles`)).send({
      plate: "XY999ZZ",
      model: "Fiat Uno",
    });

    const [found] = await search("Lucía");
    expect(found).toBeDefined();
    expect(found?.vehicles.map((v) => v.plate)).toEqual(["LM456KL", "XY999ZZ"]);
  });

  it("refuses a customer without a phone", async () => {
    const res = await withSession(request(app).post("/api/customers")).send({
      name: "Sin teléfono",
      phone: "",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a vehicle without a model, and answers 404 for an unknown customer", async () => {
    const id = await addCustomer("Pedro", "+54 11 5555-0005");
    const noModel = await withSession(request(app).post(`/api/customers/${id}/vehicles`)).send({
      plate: "AA111AA",
      model: "",
    });
    expect(noModel.status).toBe(400);

    const unknown = await withSession(
      request(app).post("/api/customers/000000000000000000000001/vehicles"),
    ).send({
      plate: "AA111AA",
      model: "Gol",
    });
    expect(unknown.status).toBe(404);
  });

  it("requires a staff session", async () => {
    const res = await request(app).get("/api/customers").set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });
});
