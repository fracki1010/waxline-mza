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
const at = (hour: number) => new Date(Date.UTC(2026, 2, 2, hour)).toISOString();

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;
let employee: string;

const withSession = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
  r.set("Cookie", cookie).set("Origin", ORIGIN);

async function addService(name: string): Promise<string> {
  const res = await withSession(request(app).post("/api/services")).send({ name });
  expect(res.status).toBe(201);
  return res.body.id;
}

function appointment(serviceId: string, start: number) {
  return withSession(request(app).post("/api/appointments")).send({
    customerName: "Juan",
    customerPhone: "+54 11 5555-1234",
    plate: "AB123CD",
    model: "Gol",
    serviceId,
    employeeId: employee,
    start: at(start),
    end: at(start + 1),
  });
}

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureIndexes(db);
  const { insertedId } = await db
    .collection("staff")
    .insertOne({ username: "ana", displayName: "Ana", passwordHash: "x", createdAt: T0 });
  employee = insertedId.toHexString();
  cookie = `__session=${(await createSessions(db).create(employee, T0)).id}`;
  app = createApp({ db, now: () => T0, allowedOrigins: [ORIGIN] });
});

afterAll(async () => {
  await stop();
});

beforeEach(async () => {
  await db.collection("services").deleteMany({});
  await db.collection("appointments").deleteMany({});
});

describe("services", () => {
  it("adds a service and lists it by name (AC10)", async () => {
    await addService("Lavado completo");
    const res = await withSession(request(app).get("/api/services"));
    expect(res.status).toBe(200);
    expect(res.body.services).toEqual([
      expect.objectContaining({ name: "Lavado completo", active: true }),
    ]);
  });

  it("refuses an empty or blank name and saves nothing (AC13)", async () => {
    for (const name of ["", "   ", 42]) {
      const res = await withSession(request(app).post("/api/services")).send({ name });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await db.collection("services").countDocuments()).toBe(0);
  });

  it("renames a service and existing appointments show the new name (AC11)", async () => {
    const id = await addService("Lavado");
    const created = await appointment(id, 9);
    expect(created.body.serviceName).toBe("Lavado");
    const renamed = await withSession(request(app).patch(`/api/services/${id}`)).send({
      name: "Lavado premium",
    });
    expect(renamed.status).toBe(200);
    const list = await withSession(request(app).get("/api/appointments")).query({
      from: at(0),
      to: at(23),
    });
    expect(list.body.appointments[0].serviceName).toBe("Lavado premium");
  });

  it("deactivates a service: no new appointments, old ones keep it (AC12)", async () => {
    const id = await addService("Encerado");
    const old = await appointment(id, 9);
    expect(old.status).toBe(201);
    const off = await withSession(request(app).patch(`/api/services/${id}`)).send({
      active: false,
    });
    expect(off.body.active).toBe(false);

    const refused = await appointment(id, 11);
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toBe("Unknown or inactive service.");

    const still = await withSession(request(app).get("/api/appointments")).query({
      from: at(0),
      to: at(23),
    });
    expect(still.body.appointments.map((a: { serviceName: string }) => a.serviceName)).toEqual([
      "Encerado",
    ]);
  });

  it("lets an existing appointment keep a deactivated service when only its time changes", async () => {
    const id = await addService("Encerado");
    const old = await appointment(id, 9);
    await withSession(request(app).patch(`/api/services/${id}`)).send({ active: false });
    const moved = await withSession(request(app).patch(`/api/appointments/${old.body.id}`)).send({
      start: at(14),
      end: at(15),
    });
    expect(moved.status).toBe(200);
  });

  it("refuses a service request for a non-existent service", async () => {
    const res = await appointment("0123456789abcdef01234567", 9);
    expect(res.status).toBe(400);
  });

  it("requires a staff session", async () => {
    const res = await request(app).get("/api/services");
    expect(res.status).toBe(401);
  });
});
