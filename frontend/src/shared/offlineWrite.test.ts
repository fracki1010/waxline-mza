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
const { NetworkError } = await import("./api");
const { OFFLINE_BLOCKED, requireOnline, sendQueueable } = await import("./offlineWrite");
const { outbox } = await import("./outbox");

type Refusal = InstanceType<typeof ApiRefusal>;

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

const entry = { method: "POST" as const, path: "/api/sales", body: {}, label: "Venta" };

beforeEach(() => {
  memory.clear();
  setOnline(true);
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

describe("sendQueueable", () => {
  it("sends and returns the result while online", async () => {
    const send = vi.fn(async () => "sent");
    expect(await sendQueueable("c1", entry, send)).toBe("sent");
    expect(await outbox.list()).toEqual([]);
  });

  it("queues without sending when the browser is offline", async () => {
    setOnline(false);
    const send = vi.fn(async () => "sent");
    expect(await sendQueueable("c1", entry, send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect((await outbox.list())[0]).toMatchObject({ clientId: "c1", status: "pending" });
  });

  it("queues when the browser says online but the server cannot be reached", async () => {
    const send = vi.fn(async () => {
      throw new NetworkError();
    });
    expect(await sendQueueable("c2", entry, send)).toBeNull();
    expect(await outbox.list()).toHaveLength(1);
  });

  it("rethrows refusals instead of queueing them", async () => {
    const send = async () => {
      throw new ApiRefusal("INSUFFICIENT_STOCK", "x");
    };
    await expect(sendQueueable("c3", entry, send)).rejects.toBeInstanceOf(ApiRefusal);
    expect(await outbox.list()).toEqual([]);
  });
});
