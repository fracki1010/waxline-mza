import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

const { ApiRefusal } = await import("./apiRefusal");
type Refusal = InstanceType<typeof ApiRefusal>;
const { OFFLINE_BLOCKED, queueWhenOffline, requireOnline } = await import("./offlineWrite");
const { outbox } = await import("./outbox");

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

const entry = { method: "POST" as const, path: "/api/sales", body: {}, label: "Venta" };

beforeEach(() => {
  memory.clear();
});

afterEach(() => {
  setOnline(true);
});

describe("requireOnline", () => {
  it("refuses with OFFLINE_BLOCKED while offline and passes while online", () => {
    setOnline(false);
    expect(() => requireOnline()).toThrow(ApiRefusal);
    try {
      requireOnline();
    } catch (error) {
      expect((error as Refusal).code).toBe(OFFLINE_BLOCKED);
    }
    setOnline(true);
    expect(() => requireOnline()).not.toThrow();
  });
});

describe("queueWhenOffline", () => {
  it("stores the write and reports true only while offline", async () => {
    setOnline(true);
    expect(await queueWhenOffline(entry)).toBe(false);
    expect(await outbox.list()).toEqual([]);

    setOnline(false);
    expect(await queueWhenOffline(entry)).toBe(true);
    expect(await outbox.list()).toHaveLength(1);
  });
});
