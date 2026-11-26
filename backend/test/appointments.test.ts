import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/indexes.js";
import { createSessions } from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

const ORIGIN = "https://app.example";
const T0 = new Date("2026-03-02T12:00:00Z");
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 2, 2, hour, minute)).toISOString();
let SERVICE = "";

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;
let ana: string;
let bruno: string;

async function addStaff(username: string): Promise<string> {
  const { insertedId } = await db
    .collection("staff")
    .insertOne({ username, displayName: username, passwordHash: "x", createdAt: T0 });
  return insertedId.toHexString();
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Juan Pérez",
    customerPhone: "+54 11 5555-1234",
    plate: "ab123cd",
    model: "Gol 2015",
    serviceId: SERVICE,
    employeeId: ana,
    start: at(10),
    end: at(11),
    ...overrides,
  };
}

const create = (fields: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/appointments")
    .set("Cookie", cookie)
    .set("Origin", ORIGIN)
    .send(body(fields));

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await ensureIndexes(db);
  const sessions = createSessions(db);
  ana = await addStaff("ana");
  bruno = await addStaff("bruno");
  const service = await db
    .collection("services")
    .insertOne({ name: "Lavado completo", active: true, createdAt: T0 });
  SERVICE = service.insertedId.toHexString();
  cookie = `__session=${(await sessions.create(ana, T0)).id}`;
  app = createApp({ db, now: () => T0, allowedOrigins: [ORIGIN] });
});

afterAll(async () => {
  await stop();
});

beforeEach(async () => {
  await db.collection("appointments").deleteMany({});
});

describe("appointments: overlap rule", () => {
  it("creates an appointment in a free slot", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ plate: "AB123CD", status: "active", employeeId: ana });
  });

  it("refuses an overlap for the same employee and saves nothing", async () => {
    await create();
    const res = await create({ start: at(10, 30), end: at(11, 30) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPOINTMENT_OVERLAP");
    expect(await db.collection("appointments").countDocuments()).toBe(1);
  });

  it("allows the same time for a different employee", async () => {
    await create();
    const res = await create({ employeeId: bruno });
    expect(res.status).toBe(201);
  });

  it("allows an appointment that starts exactly when the previous one ends", async () => {
    await create();
    const res = await create({ start: at(11), end: at(12) });
    expect(res.status).toBe(201);
  });

  it("frees the time after a cancellation", async () => {
    const first = await create();
    const cancelled = await request(app)
      .post(`/api/appointments/${first.body.id}/cancel`)
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    const res = await create();
    expect(res.status).toBe(201);
  });

  it("refuses an edit that overlaps and leaves the stored appointment unchanged", async () => {
    await create({ start: at(9), end: at(10) });
    const second = await create({ start: at(12), end: at(13) });
    const res = await request(app)
      .patch(`/api/appointments/${second.body.id}`)
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ start: at(9, 30) });
    expect(res.status).toBe(409);
    const stored = await db
      .collection("appointments")
      .findOne({ _id: new ObjectId(second.body.id) });
    expect(stored?.start.toISOString()).toBe(at(12));
  });

  it("does not count the appointment being edited as its own overlap", async () => {
    const first = await create();
    const res = await request(app)
      .patch(`/api/appointments/${first.body.id}`)
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ end: at(11, 30) });
    expect(res.status).toBe(200);
  });
});

describe("appointments: validation and access", () => {
  it("refuses an end that is not after the start", async () => {
    const res = await create({ start: at(11), end: at(10) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses an unknown employee", async () => {
    const res = await create({ employeeId: new ObjectId().toHexString() });
    expect(res.status).toBe(400);
  });

  it("refuses a missing field", async () => {
    const incomplete: Record<string, unknown> = body();
    delete incomplete.plate;
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send(incomplete);
    expect(res.status).toBe(400);
  });

  it("refuses requests without a staff session", async () => {
    const res = await request(app).post("/api/appointments").set("Origin", ORIGIN).send(body());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("appointments: day list", () => {
  it("lists only the requested range, active only, ordered by start", async () => {
    await create({ start: at(14), end: at(15) });
    await create({ start: at(9), end: at(10) });
    const cancelled = await create({ employeeId: bruno, start: at(11), end: at(12) });
    await request(app)
      .post(`/api/appointments/${cancelled.body.id}/cancel`)
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    const res = await request(app)
      .get("/api/appointments")
      .query({ from: at(0), to: at(23) })
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.appointments.map((a: { start: string }) => a.start)).toEqual([at(9), at(14)]);
  });

  it("refuses a list without a valid range", async () => {
    const res = await request(app).get("/api/appointments").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});
