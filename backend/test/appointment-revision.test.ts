import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/indexes.js";
import { createSessions } from "../src/services/sessions.js";
import { startTestDb } from "./helpers.js";

// Two devices editing the same appointment: the second edit must not silently overwrite the first.
const ORIGIN = "https://app.example";
const T0 = new Date("2026-03-02T12:00:00Z");

let db: Db;
let stop: () => Promise<void>;
let app: Express;
let cookie: string;
let staffId: string;
let serviceId: string;

const withSession = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
  r.set("Cookie", cookie).set("Origin", ORIGIN);

async function createAppointment(): Promise<string> {
  const res = await withSession(request(app).post("/api/appointments")).send({
    customerName: "Juan Pérez",
    customerPhone: "+54 11 5555-1234",
    plate: "AB123CD",
    model: "Gol",
    serviceId,
    employeeId: staffId,
    start: "2026-03-02T13:00:00Z",
    end: "2026-03-02T14:00:00Z",
  });
  expect(res.status).toBe(201);
  return res.body.id;
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
  await Promise.all(["services", "appointments"].map((c) => db.collection(c).deleteMany({})));
  const service = await withSession(request(app).post("/api/services")).send({
    name: "Lavado",
    price: 4000,
  });
  serviceId = service.body.id;
});

describe("appointment revisions", () => {
  it("a new appointment starts at revision 1 and an edit with that revision moves it to 2", async () => {
    const id = await createAppointment();
    const edit = await withSession(request(app).patch(`/api/appointments/${id}`)).send({
      model: "Fiat",
      revision: 1,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.model).toBe("Fiat");
    expect(edit.body.revision).toBe(2);
  });

  it("an edit made on an older revision is refused and returns the current appointment", async () => {
    const id = await createAppointment();
    await withSession(request(app).patch(`/api/appointments/${id}`)).send({
      model: "Fiat",
      revision: 1,
    });
    // The other device still has revision 1 and tries to change the model again.
    const stale = await withSession(request(app).patch(`/api/appointments/${id}`)).send({
      model: "Renault",
      revision: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CHANGED_ELSEWHERE");
    expect(stale.body.appointment.model).toBe("Fiat");
    expect(stale.body.appointment.revision).toBe(2);
    const stored = await db.collection("appointments").findOne({});
    expect(stored?.model).toBe("Fiat");
  });

  it("a replayed edit with the same client id is answered without a second change", async () => {
    const id = await createAppointment();
    const clientId = randomUUID();
    const body = { model: "Fiat", revision: 1, clientId };
    const first = await withSession(request(app).patch(`/api/appointments/${id}`)).send(body);
    expect(first.status).toBe(200);
    const replay = await withSession(request(app).patch(`/api/appointments/${id}`)).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.revision).toBe(2);
    const stored = await db.collection("appointments").findOne({});
    expect(stored?.revision).toBe(2);
  });
});
