import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createApp } from "../src/app.js";
import { startTestDb } from "./helpers.js";

let db: Db;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
});
afterAll(async () => {
  await stop?.();
});

const now = () => new Date(0);
const appWithDeps = () => createApp({ db, now, allowedOrigins: [] });

it("test db round-trips a document", async () => {
  await db.collection("smoke").insertOne({ a: 1 });
  expect(await db.collection("smoke").countDocuments()).toBe(1);
});

it("createApp parses JSON bodies (malformed JSON is rejected with 400)", async () => {
  const res = await request(appWithDeps())
    .post("/anything")
    .set("Content-Type", "application/json")
    .send('{"x":');
  expect(res.status).toBe(400);
});

it("createApp mounts no routes and hides the framework header", async () => {
  const res = await request(appWithDeps()).get("/anything");
  expect(res.status).toBe(404);
  expect(res.headers["x-powered-by"]).toBeUndefined();
});

it("createApp exposes the injected deps to routes", () => {
  const app = appWithDeps();
  expect(app.locals.deps.now()).toEqual(new Date(0));
  expect(app.locals.deps.db).toBe(db);
});
